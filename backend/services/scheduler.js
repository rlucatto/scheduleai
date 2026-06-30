import { listEvents, getAuthStatus } from './calendar.js';
import { getTravelTime, geocodeAddress, getHaversineDistance } from './travel.js';
import { getDBPreferences, saveDBPreferences } from './db.js';
import { sendPushToAll } from './push.js';

let ioInstance = null;
let schedulerInterval = null;

// User settings (mutable via API)
const defaultPreferences = {
  origin: '',
  homeAddress: '',
  workAddress: '',
  transportMode: 'driving',
  prepTimeMinutes: 60, // time before departure to get ready
  leadTimeMinutes: 15,  // time before departure to warn
  advanceArrivalMinutes: 15, // arrive 15 minutes early by default
  modelPriority: ['gemini-2.5-flash'], // priority list of models
  ttsMode: 'gemini', // tts mode: gemini or browser
  ttsVoice: 'Kore', // TTS voice preference
  ttsSpeed: 1.0, // TTS speed preference
  hobbies: '',
  birthdayAlerts: '',
  userName: '',
  agentName: '',
  userBirthday: '',
  onboardingStep: 'welcome',
  favoriteTags: 'Amigo, Pessoal, Trabalho, Família',
  userTimezone: 'America/Sao_Paulo',
  userCity: 'São Paulo'
};

let userPreferences = { ...defaultPreferences };

// Load persisted preferences
// Load persisted preferences
const loadPreferences = async () => {
  try {
    userPreferences = await getDBPreferences(defaultPreferences);
    if (userPreferences.modelPriority) {
      userPreferences.modelPriority = userPreferences.modelPriority.filter(m => m !== 'gemini-2.0-flash' && m !== 'gemini-1.5-flash');
      if (userPreferences.modelPriority.length === 0) {
        userPreferences.modelPriority = ['gemini-2.5-flash'];
      }
    }
    console.log('[PREFS] Preferences loaded successfully.');
  } catch (err) {
    console.error('[PREFS] Error loading preferences:', err.message);
  }
};

loadPreferences();

// Store fired notifications to prevent duplicates
// format: { "event-id-prep": true, "event-id-leave": true }
const firedNotifications = new Set();

export const setPreferences = async (newPrefs) => {
  let updatedPrefs = { ...userPreferences, ...newPrefs };
  if (updatedPrefs.modelPriority) {
    updatedPrefs.modelPriority = updatedPrefs.modelPriority.filter(m => m !== 'gemini-2.0-flash' && m !== 'gemini-1.5-flash');
    if (updatedPrefs.modelPriority.length === 0) {
      updatedPrefs.modelPriority = ['gemini-2.5-flash'];
    }
  }

  // If origin is provided but city or timezone is missing, resolve them on the backend
  if (newPrefs.origin && (!newPrefs.userTimezone || !newPrefs.userCity)) {
    try {
      const { getTimezoneFromCoords, reverseGeocode } = await import('./travel.js');
      if (!newPrefs.userTimezone) {
        updatedPrefs.userTimezone = await getTimezoneFromCoords(newPrefs.origin);
      }
      if (!newPrefs.userCity) {
        const resolvedAddress = await reverseGeocode(newPrefs.origin);
        if (resolvedAddress) {
          const parts = resolvedAddress.split(',');
          if (parts.length >= 2) {
            updatedPrefs.userCity = parts[parts.length - 2].trim();
          } else {
            updatedPrefs.userCity = resolvedAddress;
          }
        } else {
          // Fallback parsing from address string
          const originLower = newPrefs.origin.toLowerCase();
          if (originLower.includes('chicago')) {
            updatedPrefs.userCity = 'Chicago';
          } else if (originLower.includes('são paulo') || originLower.includes('sao paulo')) {
            updatedPrefs.userCity = 'São Paulo';
          } else {
            updatedPrefs.userCity = newPrefs.origin;
          }
        }
      }
    } catch (e) {
      console.error('[PREFS] Error auto-resolving timezone/city from origin:', e.message);
    }
  }

  userPreferences = updatedPrefs;

  try {
    await saveDBPreferences(userPreferences);
    console.log('[PREFS] Preferences saved successfully.');
  } catch (err) {
    console.error('[PREFS] Error writing preferences:', err.message);
  }
  if (ioInstance) {
    ioInstance.emit('auth_change', {
      status: getAuthStatus(),
      preferences: userPreferences
    });
  }
  return userPreferences;
};

export const getPreferences = () => {
  let prefs = { ...userPreferences };
  if (prefs.modelPriority) {
    prefs.modelPriority = prefs.modelPriority.filter(m => m !== 'gemini-2.0-flash' && m !== 'gemini-1.5-flash');
    if (prefs.modelPriority.length === 0) {
      prefs.modelPriority = ['gemini-2.5-flash'];
    }
  }
  return prefs;
};

export const calculateEventTriggers = async (event, origin, mode, prepTimeOverride) => {
  const startStr = event.start?.dateTime || event.start?.date;
  if (!startStr) return null;

  const eventStart = new Date(startStr);
  const location = event.location || '';

  // Get travel time
  const travelData = await getTravelTime(
    origin || userPreferences.origin,
    location,
    mode || userPreferences.transportMode
  );

  const travelSeconds = travelData.durationSeconds || 0;
  
  // departureTime = Event Start - Travel Time - Advance Arrival Time
  const isFlexible = event.description?.includes('[depends_on:');
  const advanceArrivalMin = isFlexible ? 0 : userPreferences.advanceArrivalMinutes;
  const departureTime = new Date(eventStart.getTime() - (travelSeconds * 1000) - (advanceArrivalMin * 60 * 1000));
  
  // getReadyTime = Departure Time - prep time (default or overridden)
  const prepTime = (prepTimeOverride !== null && prepTimeOverride !== undefined)
    ? prepTimeOverride
    : (isFlexible ? 0 : userPreferences.prepTimeMinutes);
  const getReadyTime = new Date(departureTime.getTime() - (prepTime * 60 * 1000));
  
  // warnLeaveTime = Departure Time - lead time
  const warnLeaveTime = new Date(departureTime.getTime() - (userPreferences.leadTimeMinutes * 60 * 1000));

  const eventEnd = new Date(event.end?.dateTime || event.end?.date || (eventStart.getTime() + 60 * 60 * 1000));

  return {
    eventId: event.id,
    summary: event.summary,
    location,
    eventStart,
    eventEnd,
    travelData,
    departureTime,
    getReadyTime,
    warnLeaveTime,
    description: event.description || ''
  };
};
const trafficTrackingStates = new Map();

// Process events and push notifications if thresholds are met
const checkUpcomingEvents = async () => {
  try {
    // Run birthday check
    await checkBirthdays();
    // Run task deadlines check
    await checkTaskDeadlines();

    const now = new Date();
    // Check events starting in the next 12 hours
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    const events = await listEvents(timeMin, timeMax);
    if (!events || events.length === 0) return;

    // Sort events chronologically to process dependencies correctly
    const sortedEvents = [...events].sort((a, b) => {
      const aStart = new Date(a.start?.dateTime || a.start?.date || 0);
      const bStart = new Date(b.start?.dateTime || b.start?.date || 0);
      return aStart - bStart;
    });

    // 1. Process Flexible Chained Rescheduling (reschedule in Google Calendar if parent moves)
    for (let i = 0; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];
      const desc = event.description || '';
      
      if (desc.includes('[depends_on:')) {
        const match = desc.match(/\[depends_on:([^\]]+)\]/);
        if (match) {
          const parentKey = match[1].trim();
          const parentEvent = sortedEvents.find(e => e.id === parentKey || e.summary?.toLowerCase() === parentKey.toLowerCase());
          
          if (parentEvent) {
            const parentEndStr = parentEvent.end?.dateTime || parentEvent.end?.date;
            if (parentEndStr && parentEvent.location && event.location) {
              const parentEnd = new Date(parentEndStr);
              
              // Get travel time from parent to child
              const travelData = await getTravelTime(parentEvent.location, event.location, userPreferences.transportMode);
              const travelSeconds = travelData.durationSeconds || 0;
              
              // expectedStart = parentEnd + transitTime (no advance arrival buffer for flexible events)
              const expectedStart = new Date(parentEnd.getTime() + (travelSeconds * 1000));
              
              const currentStart = new Date(event.start?.dateTime || event.start?.date);
              const diffMs = Math.abs(currentStart.getTime() - expectedStart.getTime());
              
              if (diffMs > 60 * 1000) { // If it differs by more than 1 minute
                console.log(`[SCHEDULER] Rescheduling flexible event "${event.summary}" from ${currentStart.toLocaleTimeString()} to ${expectedStart.toLocaleTimeString()} due to parent event "${parentEvent.summary}" end time.`);
                
                try {
                  const originalDuration = new Date(event.end.dateTime || event.end.date).getTime() - currentStart.getTime();
                  const newEnd = new Date(expectedStart.getTime() + originalDuration);
                  
                  const { updateEvent } = await import('./calendar.js');
                  await updateEvent(event.id, {
                    start: { dateTime: expectedStart.toISOString() },
                    end: { dateTime: newEnd.toISOString() }
                  });
                  
                  // Update current local event object so triggers are calculated with updated times
                  event.start.dateTime = expectedStart.toISOString();
                  event.end.dateTime = newEnd.toISOString();
                  
                  sendNotification('schedule-update', {
                    eventId: event.id,
                    summary: event.summary,
                    message: `Ajuste de agenda: O compromisso flexível "${event.summary}" foi remarcado para às ${expectedStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} para acompanhar o término de "${parentEvent.summary}" mais o trânsito (trânsito estimado: ${travelData.durationText}).`,
                    eventTime: expectedStart,
                    departureTime: parentEnd
                  });
                } catch (rescheduleErr) {
                  console.error(`[SCHEDULER] Failed to reschedule event "${event.summary}":`, rescheduleErr.message);
                }
              }
            }
          }
        }
      }
    }

    // 2. Process triggers and notifications
    for (let i = 0; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];
      
      // Look for a preceding event in the last 4 hours or on the same day that has a location to chain origin
      let originOverride = null;
      let prepTimeOverride = null;
      
      const currentStartStr = event.start?.dateTime || event.start?.date;
      if (currentStartStr) {
        const currentStart = new Date(currentStartStr);
        
        for (let j = i - 1; j >= 0; j--) {
          const prev = sortedEvents[j];
          const prevEndStr = prev.end?.dateTime || prev.end?.date;
          if (prevEndStr && prev.location) {
            const prevEnd = new Date(prevEndStr);
            const diffHours = (currentStart.getTime() - prevEnd.getTime()) / (3600 * 1000);
            if (diffHours >= 0 && diffHours <= 4) {
              console.log(`[SCHEDULER] Event "${event.summary}" is chained after "${prev.summary}". Origin set to "${prev.location}"`);
              originOverride = prev.location;
              prepTimeOverride = 0; // No get-ready time needed since we are already out
              break;
            }
          }
        }
      }

      const triggers = await calculateEventTriggers(event, originOverride, null, prepTimeOverride);
      if (!triggers) continue;

      const { eventId, summary, getReadyTime, departureTime, travelData } = triggers;
      const eventStartStr = triggers.eventStart.toISOString();
      const stateKey = `${eventId}-${eventStartStr}`;

      // Calculate minutes until departure
      const minutesToDeparture = (departureTime.getTime() - now.getTime()) / (60 * 1000);

      // Only track/notify if we are within 60 minutes of departure and event has not started yet
      if (minutesToDeparture <= 60 && now < triggers.eventStart) {
        let state = trafficTrackingStates.get(stateKey);

        if (!state) {
          // 1. INITIAL CHECK (1 hour before departure or first check in the window)
          console.log(`[SCHEDULER] Initial traffic check for event "${summary}". Departure time: ${departureTime.toLocaleTimeString('pt-BR')}`);
          
          state = {
            lastTrafficCheckTime: now,
            lastNotifiedDepartureTime: departureTime
          };
          trafficTrackingStates.set(stateKey, state);

          // Fire "get-ready" reminder (1 hour before departure)
          const prepKey = `${eventId}-prep`;
          if (!firedNotifications.has(prepKey)) {
            firedNotifications.add(prepKey);
            sendNotification('get-ready', {
              eventId,
              summary,
              message: `Hora de se arrumar! Seu compromisso "${summary}" é às ${triggers.eventStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}. Você precisará sair às ${departureTime.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} (trânsito estimado: ${travelData.durationText}).`,
              eventTime: triggers.eventStart,
              departureTime
            });
          }
        } else {
          // 2. SUBSEQUENT CHECKS: Every 15 minutes after last check
          const minutesSinceLastCheck = (now.getTime() - state.lastTrafficCheckTime.getTime()) / (60 * 1000);

          if (minutesSinceLastCheck >= 15) {
            console.log(`[SCHEDULER] 15-minute traffic check interval met for event "${summary}"`);
            
            // Re-calculate travel time to get fresh traffic info
            const latestTriggers = await calculateEventTriggers(event, originOverride, null, prepTimeOverride);
            if (latestTriggers) {
              const newDepartureTime = latestTriggers.departureTime;
              const diffMinutes = Math.abs(newDepartureTime.getTime() - state.lastNotifiedDepartureTime.getTime()) / (60 * 1000);

              if (diffMinutes > 5) {
                console.log(`[SCHEDULER] Alert: Departure time changed by ${diffMinutes.toFixed(1)} minutes (threshold 5m)`);
                
                const timeFormatter = { hour: '2-digit', minute: '2-digit' };
                const oldTimeStr = state.lastNotifiedDepartureTime.toLocaleTimeString('pt-BR', timeFormatter);
                const newTimeStr = newDepartureTime.toLocaleTimeString('pt-BR', timeFormatter);

                sendNotification('traffic-update', {
                  eventId,
                  summary,
                  message: `Alerta de trânsito: O horário de saída previsto para "${summary}" mudou de ${oldTimeStr} para ${newTimeStr} devido a alterações no trânsito (trânsito estimado: ${latestTriggers.travelData.durationText}).`,
                  eventTime: latestTriggers.eventStart,
                  departureTime: newDepartureTime
                });

                state.lastNotifiedDepartureTime = newDepartureTime;
              }
              state.lastTrafficCheckTime = now;
              trafficTrackingStates.set(stateKey, state);
            }
          }
        }
      }

      // Resolve the active departure time dynamically (use the updated one if tracked)
      let activeDepartureTime = departureTime;
      const state = trafficTrackingStates.get(stateKey);
      if (state) {
        activeDepartureTime = state.lastNotifiedDepartureTime;
      }

      const activeWarnLeaveTime = new Date(activeDepartureTime.getTime() - (userPreferences.leadTimeMinutes * 60 * 1000));

      // 3. Leave Warning Reminder (15 mins before dynamic departure)
      const leaveKey = `${eventId}-leave`;
      if (now >= activeWarnLeaveTime && now < activeDepartureTime && !firedNotifications.has(leaveKey)) {
        firedNotifications.add(leaveKey);
        sendNotification('leave-warning', {
          eventId,
          summary,
          message: `Atenção: Hora de se preparar para sair em 15 minutos! O trânsito até "${triggers.location || 'o local'}" é de ${travelData.durationText}.`,
          eventTime: triggers.eventStart,
          departureTime: activeDepartureTime
        });
      }

      // 4. Exact departure reminder
      const departKey = `${eventId}-depart`;
      if (now >= activeDepartureTime && now < new Date(activeDepartureTime.getTime() + 2 * 60 * 1000) && !firedNotifications.has(departKey)) {
        firedNotifications.add(departKey);
        sendNotification('depart-now', {
          eventId,
          summary,
          message: `Hora de Sair! Siga para "${summary}". Boa viagem!`,
          eventTime: triggers.eventStart,
          departureTime: activeDepartureTime
        });
      }
    }
  } catch (error) {
    console.error('Error checking scheduler triggers:', error);
  }
};
let lastBirthdayCheckHour = -1;

export const checkBirthdays = async (forceDate = null) => {
  try {
    const now = forceDate || new Date();
    const currentHour = now.getHours();
    
    // Only check once per hour unless forced in tests
    if (!forceDate && currentHour === lastBirthdayCheckHour) return;
    if (!forceDate) lastBirthdayCheckHour = currentHour;

    const prefs = getPreferences();
    if (!prefs.birthdayAlerts) return;

    let monitoredNames = [];
    if (prefs.birthdayAlerts) {
      if (Array.isArray(prefs.birthdayAlerts)) {
        monitoredNames = prefs.birthdayAlerts.map(n => n.trim().toLowerCase()).filter(Boolean);
      } else if (typeof prefs.birthdayAlerts === 'string') {
        monitoredNames = prefs.birthdayAlerts.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
      }
    }
    if (monitoredNames.length === 0) return;

    const { searchGoogleContacts } = await import('./contacts.js');
    
    for (const name of monitoredNames) {
      const contacts = await searchGoogleContacts(name);
      if (!contacts || contacts.length === 0) continue;

      // Find direct matches (case-insensitive name match)
      const match = contacts.find(c => c.name.toLowerCase() === name);
      if (match && match.birthday) {
        // Parse birthday (YYYY-MM-DD or MM-DD)
        const bdayParts = match.birthday.split('-');
        let bdayMonth, bdayDay;
        if (bdayParts.length === 3) {
          bdayMonth = parseInt(bdayParts[1]);
          bdayDay = parseInt(bdayParts[2]);
        } else if (bdayParts.length === 2) {
          bdayMonth = parseInt(bdayParts[0]);
          bdayDay = parseInt(bdayParts[1]);
        }

        const todayMonth = now.getMonth() + 1; // Month is 0-indexed
        const todayDay = now.getDate();

        if (todayMonth === bdayMonth && todayDay === bdayDay) {
          const fireKey = `bday-${match.resourceName}-${now.getFullYear()}`;
          if (!firedNotifications.has(fireKey)) {
            firedNotifications.add(fireKey);
            sendNotification('birthday', {
              resourceName: match.resourceName,
              summary: match.name,
              message: `🎉 Hoje é o aniversário de ${match.name}! Que tal mandar uma mensagem ou dar os parabéns?`
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[SCHEDULER] Error in checkBirthdays:', error.message);
  }
};

let lastTaskDeadlineCheckHour = -1;

export const checkTaskDeadlines = async (forceDate = null) => {
  try {
    const now = forceDate || new Date();
    const currentHour = now.getHours();
    
    // Only check once per hour unless forced in tests
    if (!forceDate && currentHour === lastTaskDeadlineCheckHour) return;
    if (!forceDate) lastTaskDeadlineCheckHour = currentHour;

    const { listTasks } = await import('./tasks.js');
    const tasks = listTasks();
    if (!tasks || tasks.length === 0) return;

    // Format today as YYYY-MM-DD
    const todayStr = now.toISOString().split('T')[0];
    
    // Format tomorrow as YYYY-MM-DD
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    for (const task of tasks) {
      if (task.state === 'completed' || task.state === 'done') continue;
      if (!task.deadline) continue;

      // Extract deadline date string (YYYY-MM-DD)
      const taskDeadlineStr = task.deadline.split('T')[0];

      if (taskDeadlineStr === todayStr) {
        const fireKey = `task-today-${task.id}`;
        if (!firedNotifications.has(fireKey)) {
          firedNotifications.add(fireKey);
          sendNotification('task-warning', {
            taskId: task.id,
            summary: task.summary,
            message: `⚠️ Atenção: A tarefa importante "${task.summary}" vence HOJE! Evite atrasos.`
          });
        }
      } else if (taskDeadlineStr === tomorrowStr) {
        const fireKey = `task-tomorrow-${task.id}`;
        if (!firedNotifications.has(fireKey)) {
          firedNotifications.add(fireKey);
          sendNotification('task-warning', {
            taskId: task.id,
            summary: task.summary,
            message: `⏰ Lembrete: A tarefa "${task.summary}" vence amanhã (${tomorrowStr}). Planeje-se para concluí-la.`
          });
        }
      }
    }
  } catch (error) {
    console.error('[SCHEDULER] Error in checkTaskDeadlines:', error.message);
  }
};

const sendNotification = (type, data) => {
  console.log(`[SCHEDULER NOTIFICATION] [${type.toUpperCase()}] ${data.message}`);
  
  const title = type === 'get-ready' ? 'Hora de se arrumar! 🧥' 
              : type === 'leave-warning' ? 'Prepare-se para sair! 🚗' 
              : type === 'birthday' ? 'Aniversário! 🎂' 
              : type === 'task-warning' ? 'Prazo de Tarefa! ⚠️' 
              : type === 'arrival' ? 'Chegada ao compromisso! 📍'
              : type === 'departure' ? 'Saída do compromisso! 🏁'
              : type === 'schedule-update' ? 'Ajuste de agenda! 📅'
              : 'Hora de Partir! 🚀';

  if (ioInstance) {
    ioInstance.emit('notification', {
      id: `notification-${Date.now()}`,
      type,
      title,
      message: data.message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  sendPushToAll(title, data.message).catch(err => {
    console.error('[SCHEDULER] Failed to send push notification:', err.message);
  });
};

export const startScheduler = (io) => {
  ioInstance = io;
  if (schedulerInterval) clearInterval(schedulerInterval);
  
  // Check triggers every minute to ensure alerts are responsive
  schedulerInterval = setInterval(checkUpcomingEvents, 60000);
  console.log('Scheduler Service Started (checking triggers every 60s)');
  
  // Run an initial check immediately
  checkUpcomingEvents();
};

export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Scheduler Service Stopped');
  }
};

export const checkLocationArrivalDeparture = async (latitude, longitude) => {
  try {
    const now = new Date();
    // Check events happening today (within +/- 3 hours)
    const timeMin = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();

    console.log(`[ARRIVALS/DEPARTURES] Checking coordinates: ${latitude}, ${longitude}`);
    const events = await listEvents(timeMin, timeMax);
    console.log(`[ARRIVALS/DEPARTURES] Found ${events?.length || 0} events between ${timeMin} and ${timeMax}`);
    if (!events || events.length === 0) return;

    for (const event of events) {
      console.log(`[ARRIVALS/DEPARTURES] Checking event: "${event.summary}" at location "${event.location}"`);
      if (!event.location) continue;

      // Geocode event location
      const eventLatLng = await geocodeAddress(event.location);
      console.log(`[ARRIVALS/DEPARTURES] Geocoded location for "${event.summary}": ${JSON.stringify(eventLatLng)}`);
      if (!eventLatLng) continue;

      // Calculate distance using Haversine
      const dist = getHaversineDistance(
        parseFloat(latitude), parseFloat(longitude),
        eventLatLng.lat, eventLatLng.lng
      );
      console.log(`[ARRIVALS/DEPARTURES] Distance to "${event.summary}": ${dist.toFixed(1)}m`);

      const desc = event.description || '';
      const hasArrival = desc.includes('[actual_arrival:');
      const hasDeparture = desc.includes('[actual_departure:');

      // 1. ARRIVAL DETECTION
      if (!hasArrival) {
        if (dist < 100) { // arrived (< 100m)
          const arrivalTimeStr = now.toISOString();
          const cleanDesc = desc ? `${desc}\n\n[actual_arrival:${arrivalTimeStr}]` : `[actual_arrival:${arrivalTimeStr}]`;
          
          console.log(`[ARRIVALS] User arrived at event "${event.summary}" (${dist.toFixed(1)}m). Updating calendar...`);
          
          const { updateEvent } = await import('./calendar.js');
          await updateEvent(event.id, { description: cleanDesc });

          sendNotification('arrival', {
            eventId: event.id,
            summary: event.summary,
            message: `Chegada registrada! Você chegou ao compromisso "${event.summary}" às ${now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}.`,
            eventTime: new Date(event.start?.dateTime || event.start?.date),
            arrivalTime: now
          });
        }
      } 
      // 2. DEPARTURE DETECTION
      else if (hasArrival && !hasDeparture) {
        // Extract arrival timestamp
        const match = desc.match(/\[actual_arrival:([^\]]+)\]/);
        if (match) {
          const arrivalTime = new Date(match[1]);
          // Require at least 3 minutes stay to prevent rapid bounce detection
          const minutesSinceArrival = (now.getTime() - arrivalTime.getTime()) / (60 * 1000);
          
          if (minutesSinceArrival >= 3) {
            if (dist >= 150) { // departed (>= 150m)
              const departureTimeStr = now.toISOString();
              const cleanDesc = `${desc}\n[actual_departure:${departureTimeStr}]`;
              
              console.log(`[DEPARTURES] User left event "${event.summary}" (${dist.toFixed(1)}m). Updating calendar...`);
              
              const { updateEvent } = await import('./calendar.js');
              await updateEvent(event.id, { description: cleanDesc });

              sendNotification('departure', {
                eventId: event.id,
                summary: event.summary,
                message: `Saída registrada! Você saiu do compromisso "${event.summary}" às ${now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}.`,
                eventTime: new Date(event.start?.dateTime || event.start?.date),
                departureTime: now
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error in checkLocationArrivalDeparture:', err.message);
  }
};
