import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Simple in-memory mock store for calendar events when OAuth is not configured
let mockEvents = [];

// Helper to pre-populate mock events relative to today's date for demo purposes
const initMockEvents = () => {
  const now = new Date();
  
  // Set dinner event for 9:00 PM today
  const dinnerStart = new Date(now);
  dinnerStart.setHours(21, 0, 0, 0);
  const dinnerEnd = new Date(dinnerStart);
  dinnerEnd.setHours(23, 0, 0, 0);

  // Set meeting for tomorrow at 2:00 PM
  const meetingStart = new Date(now);
  meetingStart.setDate(meetingStart.getDate() + 1);
  meetingStart.setHours(14, 0, 0, 0);
  const meetingEnd = new Date(meetingStart);
  meetingEnd.setHours(15, 0, 0, 0);

  mockEvents = [
    {
      id: 'mock-event-1',
      summary: 'Jantar no Rubaiyat Faria Lima',
      location: 'Av. Brg. Faria Lima, 2954 - Itaim Bibi, São Paulo - SP',
      description: 'Jantar especial com a família',
      start: { dateTime: dinnerStart.toISOString() },
      end: { dateTime: dinnerEnd.toISOString() }
    },
    {
      id: 'mock-event-2',
      summary: 'Reunião de Alinhamento de Projeto',
      location: 'Escritório Central (Google São Paulo)',
      description: 'Discussão sobre o novo plano de implantação',
      start: { dateTime: meetingStart.toISOString() },
      end: { dateTime: meetingEnd.toISOString() }
    }
  ];
};

initMockEvents();

const TOKENS_PATH = path.join(process.cwd(), 'tokens.json');

// Initialize Google OAuth2 client
export const oauth2Client = (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  ? new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/callback'
    )
  : null;

export let isGoogleConnected = false;
export let currentUserEmail = null;

// Fetch user email from Google UserInfo API
const fetchUserEmail = async () => {
  if (!oauth2Client) return;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    currentUserEmail = userInfo.data.email;
    console.log('[OAUTH] Successfully fetched user email:', currentUserEmail);
  } catch (err) {
    console.error('[OAUTH] Failed to fetch user email:', err.message);
  }
};

// Auto-load persisted tokens on startup
const loadPersistedTokens = () => {
  if (oauth2Client && fs.existsSync(TOKENS_PATH)) {
    try {
      const tokensData = fs.readFileSync(TOKENS_PATH, 'utf8');
      const tokens = JSON.parse(tokensData);
      if (tokens && Object.keys(tokens).length > 0) {
        oauth2Client.setCredentials(tokens);
        isGoogleConnected = true;
        console.log('[OAUTH] Automatically loaded persisted Google Calendar tokens from tokens.json.');
        fetchUserEmail(); // load email asynchronously
      }
    } catch (err) {
      console.error('[OAUTH] Failed to load persisted tokens:', err.message);
    }
  }
};

loadPersistedTokens();

export const getAuthStatus = () => {
  return {
    isConfigured: !!oauth2Client,
    isConnected: isGoogleConnected,
    mode: isGoogleConnected ? 'google' : 'mock',
    userEmail: currentUserEmail || 'rafael.lucatto@gmail.com'
  };
};

export const getAuthUrl = (origin) => {
  if (!oauth2Client) return null;
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: origin || ''
  });
};

export const handleAuthCode = async (code) => {
  if (!oauth2Client) throw new Error('Google OAuth credentials are not configured in .env file.');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  isGoogleConnected = true;
  
  // Persist tokens
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('[OAUTH] Google Calendar tokens persisted to tokens.json.');
  } catch (err) {
    console.error('[OAUTH] Failed to persist tokens:', err.message);
  }
  
  await fetchUserEmail();
  return tokens;
};

export const disconnectGoogle = () => {
  if (oauth2Client) {
    oauth2Client.setCredentials(null);
  }
  isGoogleConnected = false;
  currentUserEmail = null;
  
  // Remove persisted tokens file
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      fs.unlinkSync(TOKENS_PATH);
      console.log('[OAUTH] Persisted Google Calendar tokens deleted.');
    }
  } catch (err) {
    console.error('[OAUTH] Failed to delete persisted tokens:', err.message);
  }
  
  initMockEvents(); // Reset the mock events
};

export const listEvents = async (timeMin, timeMax) => {
  if (isGoogleConnected && oauth2Client) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    return response.data.items;
  } else {
    // Return mock events matching the timeframe
    const min = timeMin ? new Date(timeMin) : new Date();
    const max = timeMax ? new Date(timeMax) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return mockEvents
      .filter(event => {
        const start = new Date(event.start.dateTime || event.start.date);
        return start >= min && start <= max;
      })
      .sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));
  }
};

export const insertEvent = async (eventData) => {
  // Resolve location timezone dynamically
  let timeZone = 'America/Sao_Paulo';
  try {
    const { getPreferences } = await import('./scheduler.js');
    const { getTimezoneFromCoords } = await import('./travel.js');
    timeZone = await getTimezoneFromCoords(getPreferences().origin);
    console.log(`[CALENDAR] Resolved timezone based on location/origin: ${timeZone}`);
  } catch (tzErr) {
    console.warn('[CALENDAR] Failed to resolve location timezone, using primary calendar fallback:', tzErr.message);
  }

  if (isGoogleConnected && oauth2Client) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Fallback to primary calendar timezone if resolve failed and API is available
    if (timeZone === 'America/Sao_Paulo') {
      try {
        const calInfo = await calendar.calendars.get({ calendarId: 'primary' });
        timeZone = calInfo.data.timeZone || 'America/Sao_Paulo';
        console.log(`[CALENDAR] Auto-discovered calendar timezone: ${timeZone}`);
      } catch (tzErr) {
        console.warn('[CALENDAR] Failed to fetch calendar timezone, defaulting to America/Sao_Paulo:', tzErr.message);
      }
    }

    const finalEventData = {
      ...eventData,
      start: {
        ...eventData.start,
        timeZone: eventData.start?.timeZone || timeZone
      },
      end: {
        ...eventData.end,
        timeZone: eventData.end?.timeZone || timeZone
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: finalEventData
    });
    return response.data;
  } else {
    const newEvent = {
      id: `mock-event-${Date.now()}`,
      summary: eventData.summary || 'Sem título',
      location: eventData.location || '',
      description: eventData.description || '',
      start: {
        dateTime: eventData.start?.dateTime || new Date().toISOString(),
        timeZone: eventData.start?.timeZone || timeZone
      },
      end: {
        dateTime: eventData.end?.dateTime || new Date(Date.now() + 3600000).toISOString(),
        timeZone: eventData.end?.timeZone || timeZone
      }
    };
    mockEvents.push(newEvent);
    return newEvent;
  }
};

export const deleteEvent = async (eventId) => {
  if (isGoogleConnected && oauth2Client) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    return { success: true };
  } else {
    const index = mockEvents.findIndex(event => event.id === eventId);
    if (index !== -1) {
      mockEvents.splice(index, 1);
      return { success: true };
    }
    throw new Error('Event not found in mock database');
  }
};

export const updateEvent = async (eventId, updatedFields) => {
  // Resolve location timezone dynamically
  let timeZone = 'America/Sao_Paulo';
  try {
    const { getPreferences } = await import('./scheduler.js');
    const { getTimezoneFromCoords } = await import('./travel.js');
    timeZone = await getTimezoneFromCoords(getPreferences().origin);
  } catch (tzErr) {
    console.warn('[CALENDAR] Failed to resolve location timezone:', tzErr.message);
  }

  if (isGoogleConnected && oauth2Client) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Fallback to primary calendar timezone if resolve failed and API is available
    if (timeZone === 'America/Sao_Paulo') {
      try {
        const calInfo = await calendar.calendars.get({ calendarId: 'primary' });
        timeZone = calInfo.data.timeZone || 'America/Sao_Paulo';
      } catch (tzErr) {
        console.warn('[CALENDAR] Failed to fetch calendar timezone, defaulting to America/Sao_Paulo:', tzErr.message);
      }
    }

    // First retrieve the existing event
    const event = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });
    
    const merged = { ...event.data, ...updatedFields };
    
    // Ensure start/end have timeZone if they are updated
    if (merged.start) {
      merged.start = {
        ...merged.start,
        timeZone: merged.start.timeZone || timeZone
      };
    }
    if (merged.end) {
      merged.end = {
        ...merged.end,
        timeZone: merged.end.timeZone || timeZone
      };
    }

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: merged
    });
    return response.data;
  } else {
    const index = mockEvents.findIndex(event => event.id === eventId);
    if (index !== -1) {
      mockEvents[index] = {
        ...mockEvents[index],
        ...updatedFields,
        // merge start and end if they are passed as partials
        start: { 
          ...mockEvents[index].start, 
          ...updatedFields.start,
          timeZone: updatedFields.start?.timeZone || mockEvents[index].start?.timeZone || timeZone 
        },
        end: { 
          ...mockEvents[index].end, 
          ...updatedFields.end,
          timeZone: updatedFields.end?.timeZone || mockEvents[index].end?.timeZone || timeZone
        }
      };
      return mockEvents[index];
    }
    throw new Error('Event not found in mock database');
  }
};
