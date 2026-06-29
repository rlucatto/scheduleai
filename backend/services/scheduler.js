import { listEvents, getAuthStatus } from './calendar.js';
import { getTravelTime } from './travel.js';
import { getDBPreferences, saveDBPreferences } from './db.js';

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
  modelPriority: ['gemini-2.5-flash', 'gemini-2.0-flash'], // priority list of models
  ttsMode: 'gemini', // tts mode: gemini or browser
  ttsVoice: 'Puck', // TTS voice preference
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

export const getPreferences = () => userPreferences;

// Calculate all details for a single event:
// - travelDuration (seconds)
// - departureTime (Date)
// - getReadyTime (Date)
// - warnLeaveTime (Date)
export const calculateEventTriggers = async (event, origin, mode) => {
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
  const departureTime = new Date(eventStart.getTime() - (travelSeconds * 1000) - (userPreferences.advanceArrivalMinutes * 60 * 1000));
  
  // getReadyTime = Departure Time - prep time
  const getReadyTime = new Date(departureTime.getTime() - (userPreferences.prepTimeMinutes * 60 * 1000));
  
  // warnLeaveTime = Departure Time - lead time
  const warnLeaveTime = new Date(departureTime.getTime() - (userPreferences.leadTimeMinutes * 60 * 1000));

  return {
    eventId: event.id,
    summary: event.summary,
    location,
    eventStart,
    travelData,
    departureTime,
    getReadyTime,
    warnLeaveTime
  };
};

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

    for (const event of events) {
      const triggers = await calculateEventTriggers(event);
      if (!triggers) continue;

      const { eventId, summary, getReadyTime, warnLeaveTime, departureTime, travelData } = triggers;

      // 1. Get Ready Reminder (1 hour before departure)
      const prepKey = `${eventId}-prep`;
      if (now >= getReadyTime && now < warnLeaveTime && !firedNotifications.has(prepKey)) {
        firedNotifications.add(prepKey);
        sendNotification('get-ready', {
          eventId,
          summary,
          message: `Hora de se arrumar! Seu compromisso "${summary}" é às ${triggers.eventStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}. Você precisará sair às ${departureTime.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} (trânsito estimado: ${travelData.durationText}).`,
          eventTime: triggers.eventStart,
          departureTime
        });
      }

      // 2. Leave Warning Reminder (15 mins before departure)
      const leaveKey = `${eventId}-leave`;
      if (now >= warnLeaveTime && now < departureTime && !firedNotifications.has(leaveKey)) {
        firedNotifications.add(leaveKey);
        sendNotification('leave-warning', {
          eventId,
          summary,
          message: `Atenção: Hora de se preparar para sair em 15 minutos! O trânsito até "${triggers.location || 'o local'}" é de ${travelData.durationText}.`,
          eventTime: triggers.eventStart,
          departureTime
        });
      }
      
      // Optional: exact departure reminder (just in case they missed the warning)
      const departKey = `${eventId}-depart`;
      if (now >= departureTime && now < new Date(departureTime.getTime() + 2 * 60 * 1000) && !firedNotifications.has(departKey)) {
        firedNotifications.add(departKey);
        sendNotification('depart-now', {
          eventId,
          summary,
          message: `Hora de Sair! Siga para "${summary}". Boa viagem!`,
          eventTime: triggers.eventStart,
          departureTime
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
  if (ioInstance) {
    ioInstance.emit('notification', {
      id: `notification-${Date.now()}`,
      type,
      title: type === 'get-ready' ? 'Hora de se arrumar! 🧥' : type === 'leave-warning' ? 'Prepare-se para sair! 🚗' : type === 'birthday' ? 'Aniversário! 🎂' : type === 'task-warning' ? 'Prazo de Tarefa! ⚠️' : 'Hora de Partir! 🚀',
      message: data.message,
      data,
      timestamp: new Date().toISOString()
    });
  }
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
