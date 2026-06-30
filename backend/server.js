import express from 'express';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

import { 
  getAuthStatus, 
  getAuthUrl, 
  handleAuthCode, 
  disconnectGoogle, 
  listEvents, 
  insertEvent, 
  deleteEvent,
  oauth2Client,
  saveTokens
} from './services/calendar.js';
import { chatWithAssistant, checkModelsHealth, checkSingleModelHealth, getLastModelUsed, getLastKeyUsed, getLastKeyValueUsed, synthesizeSpeech } from './services/gemini.js';
import { 
  startScheduler, 
  stopScheduler, 
  getPreferences, 
  setPreferences, 
  calculateEventTriggers,
  checkLocationArrivalDeparture 
} from './services/scheduler.js';
import {
  listTasks,
  insertTask,
  updateTask,
  deleteTask
} from './services/tasks.js';
import {
  calculateDailyBudget,
  planGoalIntent,
  planReverseDeadline,
  compareSchedulingDays,
  backupPlanVersion,
  getPlanVersions
} from './services/planning.js';
import { listGoogleContacts, updateGoogleContact, deleteGoogleContact } from './services/contacts.js';
import {
  getVisibleTags,
  addTag,
  deleteTag,
  getContactTags,
  updateContactTags
} from './services/tags.js';
import { initPushService, getPublicKey } from './services/push.js';
import { saveDBSubscription, saveDBLocationRecord, getDBLocations } from './services/db.js';
import { reverseGeocodeWithEstablishment, getHaversineDistance } from './services/travel.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${Date.now() - start}ms`);
  });
  next();
});

const PORT = process.env.PORT || 5000;

// API ROUTES

// 1. Auth and Status Routes
app.get('/api/auth/status', (req, res) => {
  const lastKeyValue = getLastKeyValueUsed();
  const maskedKey = lastKeyValue ? `${lastKeyValue.substring(0, 8)}...${lastKeyValue.substring(lastKeyValue.length - 4)}` : '';
  res.json({
    status: getAuthStatus(),
    preferences: getPreferences(),
    lastModelUsed: getLastModelUsed(),
    lastKeyUsed: getLastKeyUsed(),
    lastKeyStringUsed: maskedKey,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
  });
});

app.get('/api/auth/url', (req, res) => {
  const { origin, theme } = req.query;
  
  if (oauth2Client) {
    oauth2Client.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
    console.log(`[OAUTH] Using static redirectUri: ${oauth2Client.redirectUri}`);
  }

  const stateObj = { origin: origin || '', theme: theme || 'dark' };
  const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  const url = getAuthUrl(stateStr);
  if (url) {
    res.json({ url });
  } else {
    res.status(400).json({ error: 'OAuth credentials not configured' });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  if (oauth2Client) {
    oauth2Client.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
    console.log(`[OAUTH] Callback using static redirectUri: ${oauth2Client.redirectUri}`);
  }

  try {
    const lastKeyValue = getLastKeyValueUsed();
    const maskedKey = lastKeyValue ? `${lastKeyValue.substring(0, 8)}...${lastKeyValue.substring(lastKeyValue.length - 4)}` : '';
    io.emit('auth_change', { 
      status: getAuthStatus(), 
      preferences: getPreferences(), 
      lastModelUsed: getLastModelUsed(),
      lastKeyUsed: getLastKeyUsed(),
      lastKeyStringUsed: maskedKey
    });
    
    // Decode state
    let origin = '';
    let theme = 'dark';
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        origin = decoded.origin;
        theme = decoded.theme;
      } catch (err) {
        if (state.startsWith('http')) {
          origin = state;
        } else {
          console.error('Failed to parse state:', err.message);
        }
      }
    }

    // Determine frontend URL dynamically (from state, local host fallback, or production)
    let frontendUrl = origin || 'https://scheduleai-rlucatto.web.app';
    if (!origin) {
      const host = req.headers.host || '';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      frontendUrl = isLocal ? 'http://localhost:5175' : 'https://scheduleai-rlucatto.web.app';
    }

    // Ensure frontendUrl is a valid absolute HTTP/HTTPS URL to prevent relative path redirection bugs
    if (!frontendUrl.startsWith('http://') && !frontendUrl.startsWith('https://')) {
      frontendUrl = 'https://scheduleai-rlucatto.web.app';
    }

    // If redirecting back to a localhost frontend, pass tokens in URL hash securely
    let redirectUrl = frontendUrl;
    const isLocalFrontend = frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1') || frontendUrl.includes('192.168.');
    if (tokens && isLocalFrontend) {
      const tokensBase64 = Buffer.from(JSON.stringify(tokens)).toString('base64');
      redirectUrl = `${frontendUrl}#tokens=${tokensBase64}`;
    }

    // Redirect back or close popup
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Conexão Concluída | ScheduleAI</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
          :root {
            ${theme === 'light' ? `
            --bg-gradient: linear-gradient(135deg, #f5f5f7 0%, #e8e8f0 50%, #d2d2dc 100%);
            --glass-bg: rgba(255, 255, 255, 0.45);
            --glass-border: rgba(0, 0, 0, 0.08);
            --text-primary: #1d1d1f;
            --text-secondary: #515154;
            --success-neon: #00b05b;
            --success-glow: rgba(0, 176, 91, 0.15);
            ` : `
            --bg-gradient: linear-gradient(135deg, #0f0c20 0%, #15102a 50%, #06020f 100%);
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.08);
            --text-primary: #ffffff;
            --text-secondary: #a0a0ab;
            --success-neon: #00ff87;
            --success-glow: rgba(0, 255, 135, 0.2);
            `}
          }
          
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg-gradient);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: var(--text-primary);
            overflow: hidden;
            transition: all 0.3s ease;
          }

          /* Background decorative ambient lights */
          .glow-orb {
            position: absolute;
            width: 400px;
            height: 400px;
            border-radius: 50%;
            background: ${theme === 'light' 
              ? 'radial-gradient(circle, rgba(123, 97, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%)' 
              : 'radial-gradient(circle, rgba(123, 97, 255, 0.15) 0%, rgba(0, 0, 0, 0) 70%)'};
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 0;
            pointer-events: none;
          }

          .container {
            position: relative;
            z-index: 1;
            width: 90%;
            max-width: 460px;
            text-align: center;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 3rem 2rem;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
            animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          /* Icon Container and Animations */
          .icon-wrapper {
            position: relative;
            width: 96px;
            height: 96px;
            margin: 0 auto 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .icon-ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid ${theme === 'light' ? 'rgba(0, 176, 91, 0.15)' : 'rgba(0, 255, 135, 0.15)'};
            box-shadow: 0 0 20px var(--success-glow);
          }

          .icon-ring-pulse {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid var(--success-neon);
            animation: pulse 2s infinite ease-out;
            opacity: 0;
          }

          @keyframes pulse {
            0% {
              transform: scale(1);
              opacity: 0.6;
            }
            100% {
              transform: scale(1.3);
              opacity: 0;
            }
          }

          .checkmark-svg {
            width: 48px;
            height: 48px;
            color: var(--success-neon);
            z-index: 1;
          }

          .checkmark-path {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: drawCheckmark 0.6s 0.2s ease-in-out forwards;
          }

          @keyframes drawCheckmark {
            to {
              stroke-dashoffset: 0;
            }
          }

          /* Typography */
          h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 0.75rem;
            letter-spacing: -0.5px;
            background: ${theme === 'light' ? 'linear-gradient(135deg, #1d1d1f 0%, #424245 100%)' : 'linear-gradient(135deg, #ffffff 0%, #dcdcdf 100%)'};
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          p {
            font-size: 15px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: 2rem;
          }

          /* Redirection/Sub text */
          .status-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: ${theme === 'light' ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)'};
            border: 1px solid ${theme === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)'};
            padding: 10px 16px;
            border-radius: 12px;
            display: inline-flex;
          }

          .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid ${theme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'};
            border-top-color: var(--success-neon);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          .status-text {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="glow-orb"></div>
        <div class="container">
          <div class="icon-wrapper">
            <div class="icon-ring"></div>
            <div class="icon-ring-pulse"></div>
            <svg class="checkmark-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" class="checkmark-path"></polyline>
            </svg>
          </div>
          
          <h1>Conexão Realizada!</h1>
          <p>Sua agenda Google Calendar foi vinculada com sucesso ao <strong>ScheduleAI</strong> para automação inteligente dos seus compromissos.</p>
          
          <div class="status-container">
            <div class="spinner" id="status-spinner"></div>
            <span class="status-text" id="status-text">Carregando...</span>
          </div>
        </div>

        <script>
          const isPopup = !!window.opener;
          const subText = document.getElementById('status-text');
          const spinner = document.getElementById('status-spinner');
          
          if (!isPopup) {
            subText.innerText = 'Redirecionando de volta...';
            setTimeout(() => {
              window.location.href = "${redirectUrl}";
            }, 2000);
          } else {
            subText.innerText = 'Fechando esta janela em instantes...';
            setTimeout(() => {
              try {
                window.opener.postMessage({ type: 'auth_success', tokens: ${JSON.stringify(tokens)} }, '*');
              } catch (e) {
                console.error('Failed to postMessage to opener:', e);
              }
              window.close();
            }, 2000);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging OAuth code:', error);
    res.status(500).send(`Erro de Autenticação: ${error.message}`);
  }
});

app.post('/api/auth/save-tokens', async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) {
    return res.status(400).json({ error: 'Missing tokens' });
  }
  try {
    const lastKeyValue = getLastKeyValueUsed();
    const maskedKey = lastKeyValue ? `${lastKeyValue.substring(0, 8)}...${lastKeyValue.substring(lastKeyValue.length - 4)}` : '';
    io.emit('auth_change', { 
      status, 
      preferences: getPreferences(), 
      lastModelUsed: getLastModelUsed(),
      lastKeyUsed: getLastKeyUsed(),
      lastKeyStringUsed: maskedKey
    });
    res.json({ success: true, status });
  } catch (err) {
    console.error('[OAUTH] Failed to save tokens manually:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/disconnect', async (req, res) => {
  await disconnectGoogle();
  await setPreferences({
    userName: '',
    agentName: '',
    userBirthday: '',
    onboardingStep: 'welcome',
    hobbies: '',
    birthdayAlerts: '',
    origin: '',
    homeAddress: '',
    workAddress: '',
    transportMode: 'driving',
    favoriteTags: 'Amigo, Pessoal, Trabalho, Família'
  });
  res.json({ success: true, status: getAuthStatus() });
});

// 2. Preferences
app.get('/api/preferences', (req, res) => {
  res.json(getPreferences());
});

app.get('/api/models/local', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
    const models = response.data.models || [];
    res.json(models.map(m => m.name));
  } catch (err) {
    console.log('Ollama not running or unreachable:', err.message);
    res.json([]);
  }
});

app.get('/api/models/health', async (req, res) => {
  try {
    const health = await checkModelsHealth();
    res.json(health);
  } catch (error) {
    console.error('Error checking models health:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/models/health/*', async (req, res) => {
  try {
    const modelName = req.params[0];
    if (!modelName) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    console.log(`[HEALTH DIAGNOSTICS] Checking single model: ${modelName}`);
    const health = await checkSingleModelHealth(modelName);
    res.json(health);
  } catch (error) {
    console.error(`Error checking health:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/preferences', async (req, res) => {
  const updated = await setPreferences(req.body);
  res.json(updated);
});

// 3. Calendar Operations
app.get('/api/calendar/events', async (req, res) => {
  try {
    const events = await listEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  try {
    const newEvent = await insertEvent(req.body);
    res.json(newEvent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/calendar/events/:id', async (req, res) => {
  try {
    const result = await deleteEvent(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Calculations (Schedule alerts mapping for frontend)
app.get('/api/calendar/calculate', async (req, res) => {
  try {
    const userPreferences = getPreferences();
    const tz = userPreferences.userTimezone || 'America/Sao_Paulo';
    
    // Get start and end of today in the user's local timezone
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [{ value: mo }, , { value: da }, , { value: ye }] = dtf.formatToParts(new Date());
    const dateStr = `${ye}-${mo}-${da}`;
    
    // Get the timezone offset for the current time
    const dtfOffset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset'
    });
    const parts = dtfOffset.formatToParts(new Date());
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value;
    
    let offset = '+00:00';
    if (offsetPart && offsetPart.startsWith('GMT')) {
      const clean = offsetPart.substring(3);
      if (clean) {
        if (clean.includes(':')) {
          offset = clean;
        } else {
          const sign = clean.charAt(0);
          const val = clean.substring(1);
          offset = `${sign}${val.padStart(2, '0')}:00`;
        }
      }
    }
    
    const timeMin = new Date(`${dateStr}T00:00:00${offset}`).toISOString();
    const timeMax = new Date(`${dateStr}T23:59:59${offset}`).toISOString();

    const events = await listEvents(timeMin, timeMax);
    const calculations = [];
    
    for (const event of events) {
      const triggers = await calculateEventTriggers(event);
      if (triggers) {
        calculations.push(triggers);
      }
    }
    
    res.json(calculations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4b. Widget data summary for Android home screen widget
app.get('/api/widget/data', async (req, res) => {
  try {
    const { listEvents } = await import('./services/calendar.js');
    const { calculateEventTriggers } = await import('./services/scheduler.js');
    
    const events = await listEvents();
    const calculations = [];
    
    // Sort chronologically
    const sortedEvents = [...events].sort((a, b) => {
      const aStart = new Date(a.start?.dateTime || a.start?.date || 0);
      const bStart = new Date(b.start?.dateTime || b.start?.date || 0);
      return aStart - bStart;
    });

    const userPreferences = getPreferences();
    const origin = userPreferences.origin;
    let lastEventLocation = origin;
    let lastEventEndTime = null;

    for (let i = 0; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];
      const isConsecutive = lastEventEndTime && (new Date(event.start?.dateTime || event.start?.date).getTime() - lastEventEndTime.getTime() < 4 * 60 * 60 * 1000);
      const currentOrigin = isConsecutive ? lastEventLocation : origin;
      const prepTimeOverride = isConsecutive ? 0 : undefined;
      
      const calc = await calculateEventTriggers(event, currentOrigin, null, prepTimeOverride);
      if (calc) {
        calc.location = event.location || '';
        calc.htmlLink = event.htmlLink || '';
        calc.eventId = event.id || '';
        calculations.push(calc);
        lastEventLocation = event.location || origin;
        lastEventEndTime = new Date(event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date);
      }
    }

    const now = new Date();
    const colorsList = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    
    const dayEvents = calculations.map((calc, idx) => {
      const evStart = new Date(calc.eventStart);
      const evEnd = calc.eventEnd ? new Date(calc.eventEnd) : new Date(evStart.getTime() + 60 * 60 * 1000);
      const departure = calc.departureTime ? new Date(calc.departureTime) : evStart;
      
      // Hide prep time if already in transit or arrived
      const isPastDeparture = now.getTime() > departure.getTime();
      const hasArrived = calc.description?.includes('[actual_arrival:') || now.getTime() > evStart.getTime();
      const hidePrep = isPastDeparture || hasArrived;
      const getReady = hidePrep ? departure : (calc.getReadyTime ? new Date(calc.getReadyTime) : evStart);

      return {
        id: calc.eventId,
        summary: calc.summary,
        location: calc.location,
        htmlLink: calc.htmlLink,
        getReadyTime: getReady.toISOString(),
        departureTime: departure.toISOString(),
        eventStartTime: evStart.toISOString(),
        eventEndTime: evEnd.toISOString(),
        color: colorsList[idx % colorsList.length]
      };
    });

    if (dayEvents.length === 0) {
      return res.json({ events: [] });
    }

    const minTimeMs = Math.min(...dayEvents.map(e => new Date(e.getReadyTime).getTime()));
    const maxTimeMs = Math.max(...dayEvents.map(e => new Date(e.eventEndTime).getTime()));

    res.json({
      events: dayEvents,
      minTime: new Date(minTimeMs).toISOString(),
      maxTime: new Date(maxTimeMs).toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Assistant Chat Router
app.post('/api/assistant/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  const response = await chatWithAssistant(message, history);
  const lastKeyValue = getLastKeyValueUsed();
  const maskedKey = lastKeyValue ? `${lastKeyValue.substring(0, 8)}...${lastKeyValue.substring(lastKeyValue.length - 4)}` : '';
  res.json({
    ...response,
    lastKeyUsed: getLastKeyUsed(),
    lastKeyStringUsed: maskedKey
  });
});

app.get('/api/assistant/proactive-greeting', async (req, res) => {
  try {
    const prefs = getPreferences();
    
    // Identify if onboarding is complete or needs to run/resume
    let targetStep = prefs.onboardingStep || 'welcome';
    if (!prefs.userName || prefs.userName.trim() === '') {
      targetStep = 'ask_username';
    } else if (!prefs.agentName || prefs.agentName.trim() === '') {
      targetStep = 'ask_agentname';
    } else if (!prefs.homeAddress || prefs.homeAddress.trim() === '') {
      targetStep = 'ask_home';
    }

    if (targetStep !== prefs.onboardingStep) {
      console.log(`[ONBOARDING] Resetting/resuming onboarding step to: ${targetStep} because critical info is missing.`);
      await setPreferences({ onboardingStep: targetStep });
    }

    // Check if onboarding is active
    if (targetStep === 'welcome' || targetStep === 'ask_username') {
      const welcomeMessage = `E aí! Eu sou o **ScheduleAI**, seu parceiro de organização inteligente. Estou aqui para te ajudar com seus compromissos, tarefas e tempos de deslocamento.\n\nPara a gente se conhecer melhor, como você prefere ser chamado (seu nome ou apelido)?`;
      await setPreferences({ onboardingStep: 'ask_username' });
      return res.json({ text: welcomeMessage });
    } else if (targetStep !== 'completed') {
      const stepPrompts = {
        'ask_username': 'Como você prefere que eu te chame? Pode ser seu nome ou algum apelido.',
        'ask_agentname': 'E como você gostaria de me chamar?',
        'ask_home': 'Qual é o seu endereço de casa? Isso me ajuda a calcular seu tempo de trânsito.',
        'ask_work': 'E qual o endereço do seu trabalho?',
        'ask_hobbies': 'Quais são seus hobbies ou o que você mais gosta de fazer no tempo livre?',
        'ask_birthday': 'Quando é o seu aniversário? (Dia e mês ou ano também se quiser)',
        'ask_birthday_alerts': 'Quais são os nomes de contatos importantes que você quer que eu te lembre do aniversário deles?'
      };
      const message = `E aí! Vamos continuar de onde paramos?\n\n${stepPrompts[targetStep] || 'Como você prefere ser chamado?'}`;
      return res.json({ text: message });
    }

    const city = prefs.origin || 'São Paulo';
    const cleanCity = city.split(',')[0].trim();
    const hobbies = prefs.hobbies || '';
    const birthdayAlerts = prefs.birthdayAlerts || '';
    
    const cleanHobbies = Array.isArray(hobbies) ? hobbies.join(', ') : hobbies;
    const cleanBirthdayAlerts = Array.isArray(birthdayAlerts) ? birthdayAlerts.join(', ') : birthdayAlerts;

    // Dynamically import searching functions
    const { executeWithFallback } = await import('./services/gemini.js');
    
    // We skip live web search during startup to make the proactive greeting load instantly (< 1.5s).
    // If the user wants to search for local events, they can ask the assistant in the chat.
    const searchContext = '';

    const response = await executeWithFallback(async (genAIInstance, modelName) => {
      const model = genAIInstance.getGenerativeModel({ model: modelName });
      const prompt = `Você é o ScheduleAI, um amigo e parceiro do usuário no dia a dia, ajudando de forma informal, descontraída e prestativa.
Gere uma saudação inicial personalizada e proativa para a tela de chat do usuário.
Use um tom de conversa super informal e amigável (ex: usando "E aí!", "Beleza?", "Mano", "Cara").
Suas preferências atuais são:
- Hobbies cadastrados: "${cleanHobbies}"
- Localização/Origem: "${city}"
- Monitoramento de Aniversários: "${cleanBirthdayAlerts}"
Hoje é dia ${new Date().toLocaleDateString('pt-BR')}.

Informações de trending events na região de ${cleanCity} encontradas na busca (com endereços e detalhes):
${searchContext || 'Nenhum evento encontrado.'}

Sua tarefa:
Gere uma saudação curta (2 a 4 frases no máximo) com um tom super descontraído, informal e amigável de amigo.
Você deve escolher UMA das seguintes abordagens proativas:
1. Fazer perguntas pessoais simpáticas e informais para conhecer melhor os hobbies e preferências dele (ex: o que ele curte fazer de bom, esportes, shows, praias, pubs, séries) para te ajudar a organizar o tempo dele.
2. Sugerir 1 ou 2 eventos locais ou trending na região de ${cleanCity} ou arredores que combinem com os gostos dele ou que estejam bombando, incluindo links de mapas do Google Maps se houver endereço físico, usando o formato de link markdown [Endereço](URL).

Responda APENAS com o texto da saudação direta para o chat (em formato Markdown de texto, sem metadados, wraps ou aspas).`;

      const genRes = await model.generateContent(prompt);
      return { text: genRes.response.text() };
    }, null, "generate proactive greeting");

    res.json({ text: response.text });
  } catch (error) {
    console.error('[PROACTIVE GREETING] Error generating greeting:', error);
    res.json({
      text: 'E aí! Como tá o seu dia, beleza? Quais são os teus hobbies preferidos ou o que você quer planejar hoje? Posso também te sugerir os melhores rolês aqui na região, fala aí!'
    });
  }
});

app.post('/api/assistant/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  try {
    const audio = await synthesizeSpeech(text, voice);
    res.json({ audio });
  } catch (error) {
    console.error('TTS Endpoint Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Tasks Routes
app.get('/api/tasks', (req, res) => {
  res.json(listTasks());
});

app.post('/api/tasks', (req, res) => {
  try {
    const newTask = insertTask(req.body);
    res.json(newTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const updated = updateTask(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const result = deleteTask(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.5. Contacts Routes
app.get('/api/contacts', async (req, res) => {
  try {
    const { email } = req.query;
    const contacts = await listGoogleContacts();
    
    // Enrich each contact with its tags
    const enriched = await Promise.all(contacts.map(async c => ({
      ...c,
      tags: await getContactTags(c.resourceName, email)
    })));
    
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts/update', async (req, res) => {
  try {
    const { resourceName, contactData } = req.body;
    const updated = await updateGoogleContact(resourceName, contactData);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts/delete', async (req, res) => {
  try {
    const { resourceName } = req.body;
    const result = await deleteGoogleContact(resourceName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tags endpoints
app.get('/api/tags', async (req, res) => {
  try {
    const { email } = req.query;
    const tags = await getVisibleTags(email);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tags', async (req, res) => {
  try {
    const { name, type, email } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const tags = await addTag(name, type, email);
    res.json(tags);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/tags', async (req, res) => {
  try {
    const { name, email } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Name query parameter is required' });
    }
    const tags = await deleteTag(name, email);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts/tags', async (req, res) => {
  try {
    const { resourceName, tags, email } = req.body;
    if (!resourceName) {
      return res.status(400).json({ error: 'resourceName is required' });
    }
    const updatedTags = await updateContactTags(resourceName, tags || [], email);
    res.json({ resourceName, tags: updatedTags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Planning Routes
app.get('/api/planning/budget', async (req, res) => {
  try {
    const budget = await calculateDailyBudget(req.query.date);
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/planning/compare', async (req, res) => {
  try {
    const { day1, day2 } = req.query;
    if (!day1 || !day2) {
      return res.status(400).json({ error: 'Both day1 and day2 parameters are required' });
    }
    const comparison = await compareSchedulingDays(day1, day2);
    res.json(comparison);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/reverse', async (req, res) => {
  try {
    const { deadline, projectTitle } = req.body;
    if (!deadline || !projectTitle) {
      return res.status(400).json({ error: 'Both deadline and projectTitle are required' });
    }
    const steps = await planReverseDeadline(deadline, projectTitle);
    res.json({ success: true, steps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/planning/intent', async (req, res) => {
  try {
    const proposals = await planGoalIntent(req.body);
    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Plan Versions Routes
app.post('/api/planning/version', (req, res) => {
  try {
    const { date, timelineState } = req.body;
    const version = backupPlanVersion(date, timelineState);
    res.json(version);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/planning/version', (req, res) => {
  try {
    const versions = getPlanVersions(req.query.date);
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Web Push / PWA Routes
app.get('/api/push/public-key', (req, res) => {
  const publicKey = getPublicKey();
  res.json({ publicKey });
});

app.post('/api/push/register', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription object is required' });
    }
    await saveDBSubscription(subscription);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/location/track', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Both latitude and longitude are required' });
    }

    // Check distance to previous point
    const allLocations = await getDBLocations();
    if (allLocations && allLocations.length > 0) {
      const sorted = [...allLocations].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const latest = sorted[0];
      const dist = getHaversineDistance(
        parseFloat(latitude), parseFloat(longitude),
        parseFloat(latest.latitude), parseFloat(latest.longitude)
      );
      
      if (dist < 50) { // 50 meters threshold
        console.log(`[LOCATION TRACKING] Location too close to last point (${dist.toFixed(1)}m < 50m). Skipping save.`);
        return res.json({ success: true, skipped: true, reason: 'too_close', distance: dist });
      }
    }

    const { address, establishment } = await reverseGeocodeWithEstablishment(latitude, longitude);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    const record = {
      date: dateStr,
      time: timeStr,
      timestamp: now.toISOString(),
      latitude,
      longitude,
      address,
      observations: establishment ? `Estabelecimento: ${establishment}` : ''
    };

    await saveDBLocationRecord(record);
    
    // Check if user arrived or left any scheduled calendar events
    await checkLocationArrivalDeparture(latitude, longitude);

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/location/history', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }
    const allLocations = await getDBLocations();
    const filtered = allLocations.filter(loc => loc.date === date);
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket Connections
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Start scheduler
startScheduler(io);

// Initialize Push Service
await initPushService();

// Start server
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 ScheduleAI Server running on port ${PORT}`);
  console.log(`📂 Base path: ${process.cwd()}`);
  console.log(`==================================================`);
});

// Clean termination handling
process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});
