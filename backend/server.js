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
import { listGoogleContacts, updateGoogleContact } from './services/contacts.js';
import {
  getVisibleTags,
  addTag,
  getContactTags,
  updateContactTags
} from './services/tags.js';

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
  const { origin, theme } = req.query;
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
  try {
    await handleAuthCode(code);
    io.emit('auth_change', { status: getAuthStatus(), preferences: getPreferences(), lastModelUsed: getLastModelUsed() });
    
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
              window.location.href = "${frontendUrl}";
            }, 2000);
          } else {
            subText.innerText = 'Fechando esta janela em instantes...';
            setTimeout(() => {
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

app.get('/api/assistant/proactive-greeting', async (req, res) => {
  try {
    const prefs = getPreferences();
    const city = prefs.origin || 'São Paulo';
    const cleanCity = city.split(',')[0].trim();
    const hobbies = prefs.hobbies || '';
    const birthdayAlerts = prefs.birthdayAlerts || '';

    // Dynamically import searching functions
    const { getSearchGroundingContext, executeWithFallback } = await import('./services/gemini.js');
    
    // Search for trending events in user's city
    console.log(`[PROACTIVE GREETING] Grounding events search for city: ${cleanCity}...`);
    const searchContext = await getSearchGroundingContext(`trending events and popular activities in ${cleanCity}`);

    const response = await executeWithFallback(async (genAIInstance, modelName) => {
      const model = genAIInstance.getGenerativeModel({ model: modelName });
      const prompt = `Você é o ScheduleAI, um amigo e parceiro do usuário no dia a dia, ajudando de forma informal, descontraída e prestativa.
Gere uma saudação inicial personalizada e proativa para a tela de chat do usuário.
Use um tom de conversa super informal e amigável (ex: usando "E aí!", "Beleza?", "Mano", "Cara").
Suas preferências atuais são:
- Hobbies cadastrados: "${hobbies}"
- Localização/Origem: "${city}"
- Monitoramento de Aniversários: "${birthdayAlerts}"
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
    const enriched = contacts.map(c => ({
      ...c,
      tags: getContactTags(c.resourceName, email)
    }));
    
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

// Tags endpoints
app.get('/api/tags', (req, res) => {
  try {
    const { email } = req.query;
    const tags = getVisibleTags(email);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tags', (req, res) => {
  try {
    const { name, type, email } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const tags = addTag(name, type, email);
    res.json(tags);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/contacts/tags', (req, res) => {
  try {
    const { resourceName, tags, email } = req.body;
    if (!resourceName) {
      return res.status(400).json({ error: 'resourceName is required' });
    }
    const updatedTags = updateContactTags(resourceName, tags || [], email);
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
  console.log(`📂 Base path: ${process.cwd()}`);
  console.log(`==================================================`);
});

// Clean termination handling
process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});
