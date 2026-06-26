import express from 'express';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { 
  getAuthStatus, 
  getAuthUrl, 
  handleAuthCode, 
  disconnectGoogle, 
  listEvents, 
  insertEvent, 
  deleteEvent 
} from './services/calendar.js';
import { chatWithAssistant, checkModelsHealth, checkSingleModelHealth, getLastModelUsed, synthesizeSpeech } from './services/gemini.js';
import { 
  startScheduler, 
  stopScheduler, 
  getPreferences, 
  setPreferences, 
  calculateEventTriggers 
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

dotenv.config();

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

const PORT = process.env.PORT || 5000;

// API ROUTES

// 1. Auth and Status Routes
app.get('/api/auth/status', (req, res) => {
  res.json({
    status: getAuthStatus(),
    preferences: getPreferences(),
    lastModelUsed: getLastModelUsed()
  });
});

app.get('/api/auth/url', (req, res) => {
  const url = getAuthUrl();
  if (url) {
    res.json({ url });
  } else {
    res.status(400).json({ error: 'OAuth credentials not configured' });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  try {
    await handleAuthCode(code);
    io.emit('auth_change', { status: getAuthStatus(), preferences: getPreferences(), lastModelUsed: getLastModelUsed() });
    // Redirect back to frontend
    res.send(`
      <html>
        <head><title>Autenticado</title></head>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #121214; color: white;">
          <div style="text-align: center; background: #202024; padding: 2rem; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5)">
            <h1 style="color: #4caf50; margin-bottom: 1rem;">Conectado com sucesso!</h1>
            <p>Sua agenda Google Calendar está conectada ao ScheduleAI.</p>
            <p>Você pode fechar esta aba agora.</p>
            <script>
              setTimeout(() => { window.close(); }, 2000);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging OAuth code:', error);
    res.status(500).send(`Erro de Autenticação: ${error.message}`);
  }
});

app.post('/api/auth/disconnect', (req, res) => {
  disconnectGoogle();
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

app.post('/api/preferences', (req, res) => {
  const updated = setPreferences(req.body);
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
    const events = await listEvents();
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

// 5. Assistant Chat Router
app.post('/api/assistant/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  const response = await chatWithAssistant(message, history);
  res.json(response);
});

app.post('/api/assistant/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  try {
    const audio = await synthesizeSpeech(text);
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

// Socket Connections
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Start scheduler
startScheduler(io);

// Start server
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 ScheduleAI Server running on port ${PORT}`);
  console.log(`📂 Base path: C:\\Users\\rluca\\.gemini\\antigravity-ide\\scratch\\calendar-ai-assistant\\backend`);
  console.log(`==================================================`);
});

// Clean termination handling
process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});
