import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';
import { listEvents, insertEvent, deleteEvent, updateEvent } from './calendar.js';
import { getTravelTime } from './travel.js';
import { listTasks, insertTask } from './tasks.js';
import { calculateDailyBudget, planGoalIntent, planReverseDeadline, compareSchedulingDays } from './planning.js';
import { getPreferences, setPreferences } from './scheduler.js';
import { searchGoogleContacts, createGoogleContact } from './contacts.js';

dotenv.config();

let lastModelUsed = '';

export const getLastModelUsed = () => lastModelUsed;

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_BACKUP_1,
  process.env.GEMINI_API_KEY_BACKUP_2
].filter(key => key && key !== 'your_gemini_api_key_here');

const keyPool = apiKeys.map((key, idx) => ({
  key,
  name: idx === 0 ? 'Primary' : `Backup ${idx}`,
  blacklistedUntil: 0
}));

console.log(`Gemini Key Rotator initialized with ${keyPool.length} active keys.`);

const getGenAIClient = () => {
  const now = Date.now();
  const healthyKey = keyPool.find(k => k.blacklistedUntil < now);
  if (!healthyKey) {
    return null;
  }
  return {
    client: new GoogleGenerativeAI(healthyKey.key),
    keyInfo: healthyKey
  };
};

const classifyRequest = (message = '') => {
  const msgLower = message.toLowerCase();
  
  const searchKeywords = [
    'tempo', 'previsão', 'clima', 'show', 'evento', 'notícia', 'quem é', 'onde fica', 
    'endereço do', 'telefone do', 'horário de funcionamento', 'quanto custa', 'ingressos', 
    'aberto hoje', 'shopping', 'restaurante', 'apagar', 'deletar', 'cancelar', 'remover', 'excluir',
    'contato', 'contatos'
  ];
  const needsSearch = searchKeywords.some(kw => msgLower.includes(kw));

  // 2. Check if needs heavy reasoning/planning
  const reasoningKeywords = [
    'reverso', 'comparar', 'otimizar', 'viabilidade', 'planejamento', 'cronograma semanal', 
    'habito', 'hábito', 'organizar meu dia', 'conflito', 'carga horária'
  ];
  const needsHeavyReasoning = reasoningKeywords.some(kw => msgLower.includes(kw));

  // 3. Check if needs code/rules simulation
  const codeKeywords = ['regras', 'sandbox', 'simular', 'código', 'script', 'programar', 'automação'];
  const needsCode = codeKeywords.some(kw => msgLower.includes(kw));

  // 4. Check if needs creative text output (writing messages, draft emails, ideas)
  const creativeKeywords = [
    'escrever', 'redigir', 'mensagem', 'email', 'texto', 'convite', 'motivar', 
    'criar um texto', 'sugira ideias', 'ideia', 'poema', 'frase'
  ];
  const needsCreativity = creativeKeywords.some(kw => msgLower.includes(kw));

  return { needsSearch, needsHeavyReasoning, needsCode, needsCreativity };
};

const getSmartSortedModels = (models, message) => {
  const classification = classifyRequest(message);
  
  const getModelScore = (modelName) => {
    let score = 0;
    
    // Default base priority (original index)
    const baseIndex = models.indexOf(modelName);
    score -= baseIndex; // Lower index in user preference is better

    // Parse user numbered priority prefix (e.g. "1-", "2-", etc.) for local models
    const prefixMatch = modelName.match(/^(\d+)-/);
    if (prefixMatch) {
      const num = parseInt(prefixMatch[1], 10);
      score += (20 - num) * 15; // "1-" gets +285, "2-" gets +270, etc. to strongly prioritize numbered models
    } else if (!modelName.startsWith('gemini-')) {
      score -= 100; // non-prefixed local models get pushed way down
    }

    if (classification.needsSearch) {
      // Prioritize Gemini models for search
      if (modelName.startsWith('gemini-')) {
        score += 100;
        if (modelName.includes('2.5-flash') || modelName.includes('1.5-pro')) {
          score += 50; // best search models
        }
      } else {
        score -= 200; // push Ollama down since it lacks search
      }
    }
    
    if (classification.needsHeavyReasoning) {
      // Prioritize reasoning models (pro, LOGICA, or flash as fallback)
      if (modelName.includes('pro') || modelName.includes('LOGICA')) {
        score += 80;
      } else if (modelName.includes('2.5-flash')) {
        score += 30;
      }
    }
    
    if (classification.needsCode) {
      // Prioritize coding models
      if (modelName.includes('coder') || modelName.includes('PROGRAMACAO') || modelName.includes('pro')) {
        score += 80;
      }
    }

    if (classification.needsCreativity) {
      // Prioritize creative models
      if (modelName.includes('CRIATIVO') || modelName.includes('creative') || modelName.includes('pro')) {
        score += 80;
      }
    }

    // Default fast/simple action fallback
    if (!classification.needsSearch && !classification.needsHeavyReasoning && !classification.needsCode && !classification.needsCreativity) {
      // Prioritize fast models (RAPIDO, MUITORAPIDO, flash)
      if (modelName.includes('RAPIDO') || modelName.includes('flash') || modelName.includes('MUITORAPIDO')) {
        score += 30;
      }
    }

    return score;
  };

  const sorted = [...models].sort((a, b) => getModelScore(b) - getModelScore(a));
  console.log(`[SMART ROUTING] Prompt: "${message}". Classification:`, classification, `-> Sorted Priority:`, sorted);
  return sorted;
};

const getLocalModels = async () => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
    const models = response.data.models || [];
    return models.map(m => m.name);
  } catch (err) {
    console.log('[AI ROUTING] Ollama not running or unreachable when listing models:', err.message);
    return [];
  }
};

const executeWithFallback = async (geminiApiCallFn, ollamaApiCallFn, message = '') => {
  const prefs = getPreferences();
  let models = [...(prefs.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'])];
  
  // Auto-append local Ollama models if they aren't already in the priority list
  try {
    const localModels = await getLocalModels();
    for (const lm of localModels) {
      if (!models.includes(lm)) {
        models.push(lm);
      }
    }
  } catch (e) {
    console.warn('[FALLBACK] Failed to auto-append local models:', e.message);
  }
  
  const sortedModels = getSmartSortedModels(models, message);
  
  for (const modelName of sortedModels) {
    if (!modelName.startsWith('gemini-')) {
      if (!ollamaApiCallFn) {
        continue; // Skip local models if no Ollama handler is provided (e.g. during search grounding)
      }
      // Local Ollama model
      try {
        console.log(`[OLLAMA ROUTING] Trying local model: "${modelName}"`);
        const result = await ollamaApiCallFn(modelName);
        lastModelUsed = modelName;
        return { ...result, modelUsed: modelName };
      } catch (error) {
        console.warn(`[OLLAMA ROUTING] Local model "${modelName}" failed:`, error.message);
        continue; // Try next model in priority
      }
    } else {
      // Gemini model
      const healthyKeysCount = keyPool.filter(k => k.blacklistedUntil < Date.now()).length;
      if (healthyKeysCount === 0) {
        console.warn(`[KEY ROTATOR] No healthy Gemini keys available. Skipping Gemini model "${modelName}"...`);
        continue;
      }

      let success = false;
      let resultValue;
      const maxRetries = keyPool.length;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const active = getGenAIClient();
        if (!active) {
          break; // No healthy keys left
        }

        try {
          console.log(`[KEY ROTATOR] Using key: "${active.keyInfo.name}" with model: "${modelName}"`);
          resultValue = await geminiApiCallFn(active.client, modelName);
          success = true;
          break; // Success! Break retry loop
        } catch (error) {
          const errorMsg = error.message || '';
          if (errorMsg.includes('429') || errorMsg.includes('Quota exceeded') || errorMsg.includes('quota') || errorMsg.includes('503')) {
            console.warn(`[KEY ROTATOR] Model "${modelName}" on key "${active.keyInfo.name}" failed (Quota/Limit). Blacklisting this key for 1 hour.`);
            active.keyInfo.blacklistedUntil = Date.now() + 60 * 60 * 1000; // 1 hour
          } else {
            throw error; // Fail immediately on structural/auth errors
          }
        }
      }

      if (success) {
        lastModelUsed = modelName;
        return { ...resultValue, modelUsed: modelName };
      }
    }
  }
  throw new Error('Todos os modelos (locais e Gemini) falharam ou estão indisponíveis.');
};

// System instructions for the calendar assistant
const systemInstruction = `Você é o "ScheduleAI", um assistente pessoal inteligente para gerenciamento de agenda, tarefas e rotinas proativas, atuando em três camadas: Planejar (organizar rotinas viáveis), Acompanhar (check-ins e progresso) e Recuperar (reorganizar após atrasos).
O usuário fala em português. Suas principais responsabilidades são:
1. Ajudar o usuário a gerenciar seus compromissos e tarefas (listar, adicionar, atualizar, excluir).
2. Ser proativo: calcule trânsito, adicione blocos de tempo oculto e avalie a viabilidade diária.
3. Se o usuário quiser criar uma meta (ex: voltar a se exercitar) ou planejar em torno de um prazo (deadline), use as ferramentas de intenção (create_goal_intent) e reverso (create_reverse_plan).
4. Usar ferramentas sempre que o usuário pedir para criar, listar, alterar ou deletar compromissos e tarefas.
5. PROATIVIDADE EM EVENTOS PÚBLICOS/SHOWS: Se o usuário disser que precisa ir a um evento público, show ou estabelecimento (ex: "show do Ed Sheeran hoje"):
   - Você deve usar o "Contexto de Busca na Internet (Fatos reais)" fornecido para encontrar proativamente o local (estádio, teatro, arena) e o horário de início do evento.
   - Caso o usuário mencione "hoje" (ou uma data específica), você DEVE agendar o evento para essa data específica (hoje), mesmo que os resultados da busca histórica citem outra data original (use o local/horário da busca, mas a data solicitada pelo usuário).
   - Se o horário de início não estiver explícito na busca, assuma um horário padrão adequado para o tipo de evento (ex: 21:00 para shows noturnos).
   - Se o horário de término não for informado, defina uma duração padrão adequada (ex: 3 horas para shows).
   - ATENÇÃO AO VIRAR A MEIA-NOITE: Ao calcular o horário de término (endTime) de um evento, se ele começar tarde da noite (ex: às 21:00 ou posterior) e durar algumas horas, lembre-se de incrementar a data do dia para o dia seguinte no endTime (ex: se começa em 2026-06-25T21:00:00Z com 3h de duração, o endTime deve ser 2026-06-26T00:00:00Z). O endTime NUNCA deve ser anterior ou igual ao startTime, pois isso resultará em erro da API.
   - Você DEVE chamar proativamente a ferramenta \`check_travel_time\` para calcular o trânsito da geolocalização do usuário (local de partida/origin nas preferências) até o local do evento.
   - IMPORTANTE: Ao chamar a ferramenta \`check_travel_time\`, o parâmetro \`destination\` deve ser o local exato do evento (ex: "Allianz Parque, São Paulo"). O local de partida do usuário já é obtido automaticamente pelo sistema a partir de suas preferências (geolocalização), portanto NÃO passe o endereço de partida do usuário no parâmetro \`destination\`.
   - Você DEVE chamar \`create_calendar_event\` com as informações completas do evento (título, local exato e horários).
   - IMPORTANTE: Ao agendar um show ou evento público solicitado pelo usuário, chame as ferramentas \`create_calendar_event\` e \`check_travel_time\` diretamente e em paralelo na primeira resposta. NÃO chame \`list_calendar_events\` nem verifique a agenda antes de agendar, a menos que o usuário tenha solicitado especificamente para verificar conflitos.
   - No retorno para o usuário, informe de forma clara que o evento foi agendado, mostre o tempo de deslocamento calculado e recomende o horário limite de saída para que ele não se atrase.
6. PROATIVIDADE NA EXCLUSÃO/CANCELAMENTO DE COMPROMISSOS: Se o usuário solicitar a remoção, exclusão, cancelamento ou para "apagar" um evento (ex: "cancelar show do Ed Sheeran" ou "apagar dentista"):
    - Você NÃO deve perguntar pelo ID do evento de imediato.
    - Em vez disso, você DEVE usar a ferramenta \`list_calendar_events\` para buscar os compromissos existentes na agenda (defina um intervalo amplo, como o dia de hoje até os próximos 365 dias na data de referência do sistema).
    - Após obter a lista de eventos:
      - Se houver apenas 1 compromisso que corresponda ao nome/palavra-chave informada, chame diretamente a ferramenta \`delete_calendar_event\` com o ID desse compromisso para excluí-lo.
      - Se houver múltiplos compromissos correspondentes, liste as opções encontradas (mostrando título, data/hora e local) e pergunte de forma clara ao usuário qual deles ele deseja excluir.
      - Se o usuário estiver respondendo a uma pergunta de esclarecimento sobre qual evento apagar de uma lista de múltiplos compromissos (ex: "quero apagar o da pista premium"), você DEVE obrigatoriamente chamar a ferramenta \`list_calendar_events\` primeiro para listar os eventos novamente, localizar o ID correspondente ao evento selecionado e, em seguida, chamar \`delete_calendar_event\` com esse ID correto. NUNCA tente adivinhar, inventar ou alucinar IDs (como "mock-event-xxx" ou IDs aleatórios).
      - Se não encontrar nenhum compromisso correspondente, informe ao usuário de forma amigável que não localizou esse evento na agenda.`;

// Declare tools for Gemini function calling
const calendarTools = {
  functionDeclarations: [
    {
      name: 'list_calendar_events',
      description: 'Lista compromissos e eventos da agenda do usuário para um intervalo de tempo.',
      parameters: {
        type: 'OBJECT',
        properties: {
          timeMin: { type: 'STRING', description: 'Data/Hora de início no formato ISO (ex: 2026-06-24T15:00:00Z)' },
          timeMax: { type: 'STRING', description: 'Data/Hora de término no formato ISO (ex: 2026-06-24T23:59:59Z)' }
        }
      }
    },
    {
      name: 'create_calendar_event',
      description: 'Cria um novo compromisso na agenda do usuário.',
      parameters: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING', description: 'Título ou resumo do compromisso (ex: Jantar com o João)' },
          location: { type: 'STRING', description: 'Local físico do compromisso (ex: Restaurante Rubaiyat Faria Lima)' },
          description: { type: 'STRING', description: 'Descrição adicional ou notas do evento' },
          startTime: { type: 'STRING', description: 'Data/Hora de início no formato ISO (ex: 2026-06-24T21:00:00Z)' },
          endTime: { type: 'STRING', description: 'Data/Hora de término no formato ISO (ex: 2026-06-24T23:00:00Z)' }
        },
        required: ['summary', 'startTime', 'endTime']
      }
    },
    {
      name: 'delete_calendar_event',
      description: 'Exclui um compromisso existente na agenda do usuário utilizando o ID do evento.',
      parameters: {
        type: 'OBJECT',
        properties: {
          eventId: { type: 'STRING', description: 'O ID exclusivo do evento a ser excluído (ex: mock-event-1)' }
        },
        required: ['eventId']
      }
    },
    {
      name: 'check_travel_time',
      description: 'Verifica o tempo de trânsito e distância até um destino específico.',
      parameters: {
        type: 'OBJECT',
        properties: {
          destination: { type: 'STRING', description: 'O local de destino (endereço ou nome do estabelecimento)' },
          transportMode: { type: 'STRING', description: 'Modo de transporte: driving, walking, bicycling, transit' }
        },
        required: ['destination']
      }
    },
    {
      name: 'get_daily_time_budget',
      description: 'Calcula o orçamento de tempo diário e o score de viabilidade de compromissos para um determinado dia.',
      parameters: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'Data para analisar no formato YYYY-MM-DD (ex: 2026-06-24)' }
        }
      }
    },
    {
      name: 'create_goal_intent',
      description: 'Planeja uma meta recorrente baseada em intenções (ex: academia 3x por semana de manhã) criando propostas de horários livres.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Título da meta (ex: Academia)' },
          frequency: { type: 'NUMBER', description: 'Frequência de vezes por semana (ex: 3)' },
          durationMinutes: { type: 'NUMBER', description: 'Duração de cada sessão em minutos (ex: 60)' },
          preferredPeriod: { type: 'STRING', description: 'Período do dia preferido: morning, afternoon, evening' },
          startDate: { type: 'STRING', description: 'Data de início em formato YYYY-MM-DD' }
        },
        required: ['title', 'frequency', 'durationMinutes', 'preferredPeriod']
      }
    },
    {
      name: 'create_reverse_plan',
      description: 'Gera uma sequência de tarefas planejadas de trás para frente a partir de um prazo final (deadline).',
      parameters: {
        type: 'OBJECT',
        properties: {
          deadline: { type: 'STRING', description: 'A data do prazo final no formato ISO ou YYYY-MM-DD' },
          projectTitle: { type: 'STRING', description: 'Nome do projeto ou evento alvo da entrega' }
        },
        required: ['deadline', 'projectTitle']
      }
    },
    {
      name: 'compare_scheduling_days',
      description: 'Compara a viabilidade e carga horária de dois dias específicos para ajudar na tomada de decisão sobre qual dia agendar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          day1: { type: 'STRING', description: 'Primeiro dia para comparação (YYYY-MM-DD)' },
          day2: { type: 'STRING', description: 'Segundo dia para comparação (YYYY-MM-DD)' }
        },
        required: ['day1', 'day2']
      }
    },
    {
      name: 'list_tasks',
      description: 'Lista todas as tarefas (to-dos) do usuário.',
      parameters: {
        type: 'OBJECT',
        properties: {}
      }
    },
    {
      name: 'create_task',
      description: 'Cria uma nova tarefa ou to-do com metadados adicionais como energia, dependências e contextos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING', description: 'Título da tarefa (ex: Revisar contrato)' },
          description: { type: 'STRING', description: 'Detalhes adicionais da tarefa' },
          estimatedDuration: { type: 'NUMBER', description: 'Duração estimada da tarefa em minutos' },
          priority: { type: 'STRING', description: 'Prioridade da tarefa: high, medium, low' },
          requiredEnergy: { type: 'STRING', description: 'Esforço de energia necessário: high, medium, low' },
          deadline: { type: 'STRING', description: 'Data máxima de entrega (YYYY-MM-DD)' },
          context: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Lista de contextos exigidos (ex: computer, home, outside)' }
        },
        required: ['summary']
      }
    },
    {
      name: 'update_user_preferences',
      description: 'Atualiza as preferências do usuário, como o endereço residencial (homeAddress), o endereço de trabalho (workAddress), o ponto de partida (origin) ou configurações de tempos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          origin: { type: 'STRING', description: 'Novo endereço ou coordenadas de ponto de partida padrão.' },
          homeAddress: { type: 'STRING', description: 'Endereço residencial (casa) do usuário.' },
          workAddress: { type: 'STRING', description: 'Endereço de trabalho do usuário.' },
          transportMode: { type: 'STRING', description: 'Modo de transporte: driving, walking, bicycling, transit.' },
          prepTimeMinutes: { type: 'NUMBER', description: 'Tempo de preparação em minutos.' },
          leadTimeMinutes: { type: 'NUMBER', description: 'Tempo de alerta de saída em minutos.' },
          advanceArrivalMinutes: { type: 'NUMBER', description: 'Tempo de antecedência de chegada em minutos.' },
          modelPriority: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Lista priorizada de modelos do Gemini em ordem de preferência.' }
        }
      }
    },
    {
      name: 'search_contacts',
      description: 'Busca por contatos existentes no Google Contacts do usuário por nome, email ou telefone.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'O termo de busca (nome, sobrenome, email ou telefone).' }
        },
        required: ['query']
      }
    },
    {
      name: 'create_contact',
      description: 'Cria um novo contato no Google Contacts do usuário com nome, email, telefone e endereço comercial ou residencial.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Nome completo do contato.' },
          email: { type: 'STRING', description: 'Endereço de e-mail.' },
          phone: { type: 'STRING', description: 'Número de telefone.' },
          address: { type: 'STRING', description: 'Endereço residencial ou comercial do contato.' }
        },
        required: ['name']
      }
    }
  ]
};

// Implement mock AI response engine when Gemini key is not configured
const handleMockAIChat = async (message, history) => {
  const msgLower = message.toLowerCase();
  
  // 1. Check if user wants to list events
  if (msgLower.includes('lista') && (msgLower.includes('agenda') || msgLower.includes('compromissos') || msgLower.includes('evento'))) {
    try {
      const events = await listEvents();
      let eventList = events.map(e => {
        const start = new Date(e.start.dateTime || e.start.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(e.start.dateTime || e.start.date).toLocaleDateString('pt-BR');
        return `- **${e.summary}**: ${date} às ${start} em *${e.location || 'Sem local'}* (ID: ${e.id})`;
      }).join('\n');
      
      return {
        text: `Aqui estão os seus próximos compromissos na agenda:\n\n${eventList || 'Não encontrei nenhum compromisso próximo!'}\n\n*(Nota: Modo de Simulação de IA)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao listar eventos: ${e.message}`, toolCalls: [] };
    }
  }

  // 2. Check if user wants to list tasks
  if (msgLower.includes('lista') && (msgLower.includes('tarefa') || msgLower.includes('todo') || msgLower.includes('afazer'))) {
    try {
      const tasks = listTasks();
      let taskList = tasks.map(t => {
        const deadlineText = t.deadline ? ` (Prazo: ${new Date(t.deadline).toLocaleDateString('pt-BR')})` : '';
        const scheduledText = t.scheduledTime ? ` [Agendado para: ${new Date(t.scheduledTime).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}]` : ' [Sem data]';
        const blockedText = t.blockedBy.length > 0 ? ` (Bloqueado por: ${t.blockedBy.join(', ')})` : '';
        return `- [${t.state === 'completed' ? 'x' : ' '}] **${t.summary}** - ${t.estimatedDuration}m | Prioridade: ${t.priority} | Energia: ${t.requiredEnergy} | Contexto: ${t.context.join(', ')}${scheduledText}${deadlineText}${blockedText} (ID: ${t.id})`;
      }).join('\n');
      
      return {
        text: `Aqui estão suas tarefas pendentes:\n\n${taskList || 'Nenhuma tarefa cadastrada!'}\n\n*(Nota: Modo de Simulação de IA)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao listar tarefas: ${e.message}`, toolCalls: [] };
    }
  }

  // 3. Create task (heuristics)
  if (msgLower.includes('criar tarefa') || msgLower.includes('adicionar tarefa') || msgLower.includes('nova tarefa')) {
    try {
      const summary = message.replace(/(?:criar|adicionar|nova) tarefa/i, '').trim() || 'Nova Tarefa Simulada';
      const newTask = insertTask({
        summary,
        estimatedDuration: 45,
        priority: 'medium',
        requiredEnergy: 'high',
        context: ['computer']
      });
      return {
        text: `Tarefa **"${newTask.summary}"** criada com sucesso!\n- Duração estimada: 45m\n- Prioridade: Média\n- Energia necessária: Alta\n- ID: ${newTask.id}\n\n*(Nota: Modo de Simulação de IA)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao criar tarefa simulada: ${e.message}`, toolCalls: [] };
    }
  }

  // 4. Time Budget & Feasibility Score (heuristics)
  if (msgLower.includes('viabilidade') || msgLower.includes('orçamento') || msgLower.includes('budget') || msgLower.includes('como está meu dia')) {
    try {
      const budget = await calculateDailyBudget();
      const score = budget.feasibilityScore;
      const warningsText = budget.warnings.map(w => `- ⚠️ ${w}`).join('\n');
      
      return {
        text: `### Orçamento e Viabilidade Diária 📊\n\n**Pontuação de Viabilidade: ${score}%**\n\n- **Tempo Ocupado**: ${Math.round(budget.budget.totalOccupiedMinutes / 60)}h e ${budget.budget.totalOccupiedMinutes % 60}m\n  - Compromissos: ${budget.budget.eventsMinutes} min\n  - Preparação: ${budget.budget.prepMinutes} min\n  - Deslocamentos: ${budget.budget.travelMinutes} min\n  - Margens auto: ${budget.budget.marginMinutes} min\n  - Tarefas agendadas: ${budget.budget.tasksMinutes} min\n- **Tempo Livre**: ${Math.round(budget.budget.remainingMinutes / 60)}h e ${budget.budget.remainingMinutes % 60}m\n- **Dia Temático**: ${budget.theme}\n\n${warningsText ? `**Alertas de Risco:**\n${warningsText}` : '✅ Nenhum conflito ou risco detectado para hoje! Excelente planejamento.'}\n\n*(Nota: Calculado via Motor de Decisão)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao calcular viabilidade simulada: ${e.message}`, toolCalls: [] };
    }
  }

  // 5. Compare Days (heuristics)
  if (msgLower.includes('comparar') || msgLower.includes('melhor terça ou quinta') || msgLower.includes('melhor dia')) {
    try {
      const today = new Date();
      const tues = new Date(today);
      tues.setDate(today.getDate() + ((2 - today.getDay() + 7) % 7)); // Next Tuesday
      const thurs = new Date(today);
      thurs.setDate(today.getDate() + ((4 - today.getDay() + 7) % 7)); // Next Thursday
      
      const comp = await compareSchedulingDays(tues.toISOString().split('T')[0], thurs.toISOString().split('T')[0]);
      return {
        text: `### Comparação de Agendamento 📆\n\n**Terça-feira (${comp.day1.date})**: Viabilidade de **${comp.day1.score}%** (${comp.day1.remainingMinutes} min livres)\n**Quinta-feira (${comp.day2.date})**: Viabilidade de **${comp.day2.score}%** (${comp.day2.remainingMinutes} min livres)\n\n**Recomendação:**\n${comp.recommendation}\n\n*(Nota: Calculado via Assistente de Decisão)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao comparar dias simulados: ${e.message}`, toolCalls: [] };
    }
  }

  // 6. Reverse Planning (heuristics)
  if (msgLower.includes('reverso') || msgLower.includes('prazo final') || msgLower.includes('entrega')) {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 7); // deadline is in 7 days
      const steps = await planReverseDeadline(targetDate.toISOString(), 'Trabalho de Curso');
      
      const stepsList = steps.map(s => {
        const date = new Date(s.scheduledTime).toLocaleDateString('pt-BR');
        return `- [ ] **${s.summary}** em **${date}** (${s.estimatedDuration}m, energia: ${s.requiredEnergy})`;
      }).join('\n');

      return {
        text: `### Planejamento Reverso Estruturado ⏳\n\nDefini uma sequência de preparação de trás para frente para o prazo final de **${targetDate.toLocaleDateString('pt-BR')}**:\n\n${stepsList}\n\nEssas tarefas foram adicionadas aos seus respectivos dias para garantir que você não deixe nada para a última hora!\n\n*(Nota: Gerado via Planejamento Reverso)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro no planejamento reverso simulado: ${e.message}`, toolCalls: [] };
    }
  }

  // 7. Intent-based Goal Planning (heuristics)
  if (msgLower.includes('academia') || msgLower.includes('exercício') || msgLower.includes('meta') || msgLower.includes('objetivo')) {
    try {
      const proposals = await planGoalIntent({
        title: 'Academia 🏋️',
        frequency: 3,
        durationMinutes: 60,
        preferredPeriod: 'morning'
      });

      const proposalsText = proposals.map((p, idx) => {
        const dayStr = p.start.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
        const startStr = p.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const endStr = p.end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${idx + 1}. **${dayStr}** das **${startStr} às ${endStr}**`;
      }).join('\n');

      return {
        text: `### Planejamento de Metas por Intenção 🎯\n\nIdentifiquei seu objetivo de fazer **Academia** e encontrei os seguintes horários livres ideais esta semana:\n\n${proposalsText}\n\nSe você aprovar, irei criar estes blocos na sua agenda, incluindo 15 minutos para deslocamento e ducha!\n\n*(Nota: Gerado via Planejamento por Intenção)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro no planejamento por intenção simulado: ${e.message}`, toolCalls: [] };
    }
  }

  // 8. Check if user wants to create an event (heuristics)
  if (msgLower.includes('criar') || msgLower.includes('marcar') || msgLower.includes('agenda') || msgLower.includes('jantar') || msgLower.includes('reuniao') || msgLower.includes('reunião')) {
    try {
      let summary = 'Novo Compromisso';
      if (msgLower.includes('jantar')) summary = 'Jantar';
      if (msgLower.includes('reunião') || msgLower.includes('reuniao')) summary = 'Reunião';
      
      let location = '';
      if (msgLower.includes('no ') || msgLower.includes('em ')) {
        const parts = message.split(/(?:no |em )/i);
        if (parts.length > 1) {
          location = parts[1].split(' às')[0].split(' as')[0].trim();
        }
      }

      const now = new Date();
      let startTime = new Date(now);
      startTime.setHours(now.getHours() + 2, 0, 0, 0); 

      if (msgLower.includes('às 21') || msgLower.includes('as 21') || msgLower.includes('9 pm') || msgLower.includes('9pm') || msgLower.includes('21h')) {
        startTime.setHours(21, 0, 0, 0);
      } else if (msgLower.includes('às 20') || msgLower.includes('as 20') || msgLower.includes('8 pm') || msgLower.includes('20h')) {
        startTime.setHours(20, 0, 0, 0);
      }

      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); 

      const newEvent = await insertEvent({
        summary,
        location,
        description: 'Criado automaticamente via chat assistente',
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() }
      });

      let travelMsg = '';
      if (location) {
        const travel = await getTravelTime('Avenida Paulista', location);
        travelMsg = `\n\nIdentifiquei o local **${location}**. O trânsito estimado é de **${travel.durationText}** (${travel.distanceText}).\nConfigurei os seguintes alertas proativos:\n- Alerta para se arrumar (1 hora antes): às **${new Date(startTime.getTime() - travel.durationSeconds*1000 - 60*60*1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}**\n- Alerta para sair em 15 minutos: às **${new Date(startTime.getTime() - travel.durationSeconds*1000 - 15*60*1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}**`;
      }

      return {
        text: `Perfeito! Criei o compromisso **"${newEvent.summary}"** para hoje às **${startTime.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}** na sua agenda.${travelMsg}\n\n*(Nota: Criado via motor de simulação de IA)*`,
        toolCalls: []
      };
    } catch (e) {
      return { text: `Erro ao agendar compromisso simulado: ${e.message}`, toolCalls: [] };
    }
  }

  // 9. Delete event heuristic
  if (msgLower.includes('excluir') || msgLower.includes('deletar') || msgLower.includes('remover')) {
    const match = message.match(/mock-event-\d+/);
    if (match) {
      try {
        await deleteEvent(match[0]);
        return { text: `Compromisso com ID ${match[0]} foi excluído com sucesso da sua agenda!`, toolCalls: [] };
      } catch (e) {
        return { text: `Não consegui excluir o evento: ${e.message}`, toolCalls: [] };
      }
    }
    return {
      text: 'Para remover um evento no modo de simulação, por favor digite ou inclua o ID do evento (ex: mock-event-1).',
      toolCalls: []
    };
  }

  // Default friendly text response
  return {
    text: `Olá! Eu sou o ScheduleAI. No momento estou operando em **Modo de Simulação** (sem chave Gemini configurada).\n\nPosso ajudar você a testar as principais funções! Experimente dizer:\n- *"Listar minha agenda"* ou *"Listar minhas tarefas"*\n- *"Como está meu dia"* ou *"Viabilidade"* para ver o score e orçamento de tempo diário.\n- *"Criar tarefa Revisar Contrato"* para testar to-dos.\n- *"Quero fazer planejamento reverso"* ou *"Marcar academia 3 vezes por semana"* para testar metas por intenções.\n- *"Comparar dias"* para ver qual melhor dia de agendamento.`,
    toolCalls: []
  };
};

export const cleanSearchQuery = (query) => {
  let cleaned = query.toLowerCase();
  
  const stopPhrases = [
    'tenho que ir no', 'tenho que ir ao', 'tenho que ir na', 'tenho que ir para o', 'tenho que ir para a',
    'preciso ir no', 'preciso ir ao', 'preciso ir na', 'preciso ir para o', 'preciso ir para a',
    'vou no', 'vou ao', 'vou na', 'vou para o', 'vou para a',
    'marcar', 'agendar', 'adicionar', 'criar', 'tenho que', 'tenho de', 'preciso',
    'hoje', 'amanhã', 'amanha', 'ontem'
  ];
  
  for (const phrase of stopPhrases) {
    cleaned = cleaned.replace(phrase, '');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
};

export const searchWeb = async (query) => {
  try {
    console.log(`[SEARCH SCRAPER] Querying Yahoo Search for: "${query}"...`);
    const response = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const html = response.data;
    
    const matches = [];
    const rx = /<div class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let match;
    while ((match = rx.exec(html)) !== null && matches.length < 5) {
      const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) {
        const decoded = text
          .replace(/&ldquo;/g, '"')
          .replace(/&rdquo;/g, '"')
          .replace(/&ndash;/g, '-')
          .replace(/&mdash;/g, '-')
          .replace(/&aacute;/g, 'á')
          .replace(/&eacute;/g, 'é')
          .replace(/&iacute;/g, 'í')
          .replace(/&oacute;/g, 'ó')
          .replace(/&uacute;/g, 'ú')
          .replace(/&atilde;/g, 'ã')
          .replace(/&otilde;/g, 'õ')
          .replace(/&ccedil;/g, 'ç')
          .replace(/&Aacute;/g, 'Á')
          .replace(/&Eacute;/g, 'É')
          .replace(/&Iacute;/g, 'Í')
          .replace(/&Oacute;/g, 'Ó')
          .replace(/&Uacute;/g, 'Ú')
          .replace(/&Ccedil;/g, 'Ç')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        matches.push(decoded);
      }
    }
    
    console.log(`[SEARCH SCRAPER] Yahoo Scraper found ${matches.length} snippets.`);
    return matches.join('\n');
  } catch (error) {
    console.error('[SEARCH SCRAPER] Yahoo Scraping failed:', error.message);
    return '';
  }
};

const getSearchGroundingContext = async (message) => {
  try {
    const classification = classifyRequest(message);
    if (!classification.needsSearch) {
      return '';
    }

    const healthyKeysCount = keyPool.filter(k => k.blacklistedUntil < Date.now()).length;
    if (healthyKeysCount > 0) {
      const searchResult = await executeWithFallback(async (genAIInstance, modelName) => {
        const searchModel = genAIInstance.getGenerativeModel({ model: modelName });
        const response = await searchModel.generateContent({
          contents: [{
            role: 'user',
            parts: [{
              text: `Você é um assistente de busca inteligente. Pesquise na internet por informações sobre o seguinte pedido do usuário caso ele se refira a um evento público com data/local específicos, show, estabelecimento ou informação atualizada que necessite de busca. Hoje é dia ${new Date().toLocaleDateString('pt-BR')}.
              
              Se o pedido NÃO requerer busca na internet (por exemplo, "listar minha agenda", "criar tarefa estudar", "como está meu dia", "olá", "bom dia", etc.), responda APENAS com a palavra "NENHUMA".
              Caso contrário, retorne um resumo curto dos fatos encontrados (local, data, horário, endereço).
              
              Pedido do usuário: "${message}"`
            }]
          }],
          tools: [{ googleSearch: {} }]
        });
        const text = response.response.text();
        if (text.toUpperCase().trim().includes('NENHUMA')) {
          return { text: '' };
        }
        return { text };
      }, null, message);
      return searchResult.text;
    }
  } catch (err) {
    console.warn('[SEARCH GROUNDING] Gemini search failed. Falling back to local scraper...', err.message);
  }

  // Local Yahoo Search Grounding Scraper Fallback
  try {
    const cleanedQuery = cleanSearchQuery(message);
    const finalSearchQuery = `${cleanedQuery} data local horário`;
    console.log(`[SEARCH GROUNDING] Executing local Yahoo search for: "${finalSearchQuery}"...`);
    const searchResults = await searchWeb(finalSearchQuery);
    if (!searchResults) {
      console.log('[SEARCH GROUNDING] No results found from Yahoo Search.');
      return '';
    }

    const summaryPrompt = `Você é um assistente de busca inteligente. Abaixo estão trechos de resultados de busca na internet para o pedido: "${message}".
Hoje é dia ${new Date().toLocaleDateString('pt-BR')}.
Sua tarefa é extrair e resumir apenas as informações factuais sobre o evento:
1. Data original citada na busca (dia, mês, ano)
2. Local (estabelecimento, estádio, casa de show)
3. Horário de início aproximado
4. Endereço exato do evento, se presente.

ATENÇÃO: Apenas extraia os fatos. NÃO faça deduções, NÃO tire conclusões sobre o evento acontecer ou não hoje, NÃO faça comparações entre a data do show encontrada e a data de hoje, e NÃO adicione observações ou notas subjetivas sobre a data de hoje.

Responda em português de forma concisa e direta. Se os resultados não contiverem nenhuma informação relevante para o evento em questão, responda apenas com "Nenhum resultado relevante".

Resultados da busca:
${searchResults}`;

    console.log('[SEARCH GROUNDING] Summarizing search results using available LLM (Ollama/Backup)...');
    
    const summaryResult = await executeWithFallback(
      // Gemini Handler
      async (genAI, model) => {
        const modelObj = genAI.getGenerativeModel({ model });
        const res = await modelObj.generateContent(summaryPrompt);
        return { text: res.response.text() };
      },
      // Ollama Handler
      async (modelName) => {
        const res = await axios.post('http://localhost:11434/api/generate', {
          model: modelName,
          prompt: summaryPrompt,
          stream: false
        }, { timeout: 90000 });
        return { text: res.data.response };
      },
      message
    );

    console.log('[SEARCH GROUNDING] Local search summary result:', summaryResult.text);
    if (summaryResult.text.includes('Nenhum resultado relevante')) {
      return '';
    }
    return summaryResult.text;
  } catch (err) {
    console.error('[SEARCH GROUNDING] Local scraper fallback failed:', err.message);
    return '';
  }
};

const deepConvertTypesToLowercase = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepConvertTypesToLowercase);
  }
  const result = {};
  for (const key of Object.keys(obj)) {
    if (key === 'type' && typeof obj[key] === 'string') {
      result[key] = obj[key].toLowerCase();
    } else {
      result[key] = deepConvertTypesToLowercase(obj[key]);
    }
  }
  return result;
};

const callOllama = async (modelName, message, history, searchResultsContext) => {
  const prefs = getPreferences();
  const currentRefDate = `\n\nIMPORTANTE: A data/hora atual de referência do sistema é exatamente: ${new Date().toLocaleString('pt-BR')}. Qualquer menção a termos relativos ("hoje", "amanhã", "depois de amanhã", "esta sexta", etc.) deve ser agendada estritamente em relação a esta data de referência. NÃO use as datas históricas obtidas nas buscas da internet se o usuário pediu especificamente para hoje ou uma data relativa.`;
  const systemPrompt = systemInstruction + currentRefDate + 
    `\n\nPreferências Atuais do Usuário:\n` + JSON.stringify(prefs, null, 2) +
    (searchResultsContext ? `\n\nContexto de Busca na Internet (Fatos reais): ${searchResultsContext}` : '');

  // Map calendarTools to Ollama format converting all JSON schema types to lowercase
  const ollamaTools = calendarTools.functionDeclarations.map(fd => ({
    type: 'function',
    function: {
      name: fd.name,
      description: fd.description,
      parameters: fd.parameters ? deepConvertTypesToLowercase(fd.parameters) : {
        type: 'object',
        properties: {}
      }
    }
  }));

  // Build messages array
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Append history
  const firstUserIndex = history.findIndex(h => h.sender === 'user');
  if (firstUserIndex !== -1) {
    history.slice(firstUserIndex).forEach(h => {
      messages.push({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text
      });
    });
  }

  messages.push({ role: 'user', content: message });

  console.log(`[OLLAMA] Sending request to model: "${modelName}"`);
  const response = await axios.post('http://localhost:11434/api/chat', {
    model: modelName,
    messages,
    tools: ollamaTools,
    stream: false
  }, { timeout: 60000 });

  let assistantMessage = response.data.message;
  let toolCalls = [];
  let allExecutedToolCalls = [];

  const parseOllamaToolCalls = (msg) => {
    let tc = [];
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      tc = msg.tool_calls.map(tc => ({
        name: tc.function.name,
        args: tc.function.arguments,
        nativeCall: tc
      }));
    } else if (msg.content) {
      try {
        const trimmed = msg.content.trim();
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const potentialJson = trimmed.substring(firstBrace, lastBrace + 1);
          const parsed = JSON.parse(potentialJson);
          if (parsed && parsed.name && (parsed.arguments || parsed.parameters)) {
            const native = {
              id: 'call_fallback_' + Date.now(),
              function: {
                name: parsed.name,
                arguments: parsed.arguments || parsed.parameters
              }
            };
            tc = [{
              name: parsed.name,
              args: parsed.arguments || parsed.parameters,
              nativeCall: native
            }];
            msg.tool_calls = [native];
          }
        }
      } catch (e) {}
    }
    return tc;
  };

  toolCalls = parseOllamaToolCalls(assistantMessage);
  let turns = 0;
  const maxTurns = 5;

  while (toolCalls.length > 0 && turns < maxTurns) {
    turns++;
    console.log(`[OLLAMA] Model requested ${toolCalls.length} tool calls on turn ${turns}.`);
    messages.push(assistantMessage);
    allExecutedToolCalls.push(...assistantMessage.tool_calls);

    for (const call of toolCalls) {
      const { name, args, nativeCall } = call;
      console.log(`[OLLAMA TOOL CALLING] Executing function: ${name} with args:`, args);

      let functionResult;
      try {
        if (name === 'list_calendar_events') {
          functionResult = await listEvents(args.timeMin, args.timeMax);
        } else if (name === 'create_calendar_event') {
          functionResult = await insertEvent({
            summary: args.summary,
            location: args.location,
            description: args.description || 'Criado via Assistente Virtual ScheduleAI',
            start: { dateTime: args.startTime },
            end: { dateTime: args.endTime }
          });
        } else if (name === 'delete_calendar_event') {
          functionResult = await deleteEvent(args.eventId);
        } else if (name === 'check_travel_time') {
          functionResult = await getTravelTime(getPreferences().origin, args.destination, args.transportMode);
        } else if (name === 'get_daily_time_budget') {
          functionResult = await calculateDailyBudget(args.date);
        } else if (name === 'create_goal_intent') {
          functionResult = await planGoalIntent({
            title: args.title,
            frequency: args.frequency,
            durationMinutes: args.durationMinutes,
            preferredPeriod: args.preferredPeriod,
            startDate: args.startDate
          });
        } else if (name === 'create_reverse_plan') {
          functionResult = await planReverseDeadline(args.deadline, args.projectTitle);
        } else if (name === 'compare_scheduling_days') {
          functionResult = await compareSchedulingDays(args.day1, args.day2);
        } else if (name === 'list_tasks') {
          functionResult = listTasks();
        } else if (name === 'create_task') {
          functionResult = insertTask({
            summary: args.summary,
            description: args.description,
            estimatedDuration: args.estimatedDuration,
            priority: args.priority,
            requiredEnergy: args.requiredEnergy,
            deadline: args.deadline,
            context: args.context
          });
        } else if (name === 'update_user_preferences') {
          functionResult = setPreferences(args);
        } else if (name === 'search_contacts') {
          functionResult = await searchGoogleContacts(args.query);
        } else if (name === 'create_contact') {
          functionResult = await createGoogleContact(args);
        } else {
          functionResult = { error: `Function ${name} not found.` };
        }
      } catch (err) {
        console.error(`Ollama Tool execution error: ${name}`, err);
        functionResult = { error: err.message };
      }

      messages.push({
        role: 'tool',
        tool_call_id: nativeCall.id || ('call_' + Math.random().toString(36).substr(2, 9)),
        name: name,
        content: JSON.stringify(functionResult)
      });
    }

    console.log('[OLLAMA] Sending follow-up request with tool results...');
    const followUpResponse = await axios.post('http://localhost:11434/api/chat', {
      model: modelName,
      messages,
      tools: ollamaTools,
      stream: false
    }, { timeout: 60000 });

    assistantMessage = followUpResponse.data.message;
    toolCalls = parseOllamaToolCalls(assistantMessage);
  }

  return {
    text: assistantMessage.content,
    toolCalls: allExecutedToolCalls
  };
};

export const chatWithAssistant = async (message, history = []) => {
  try {
    console.log(`[AI ROUTING] Checking search needs for: "${message}"...`);
    const searchResultsContext = await getSearchGroundingContext(message);
    if (searchResultsContext) {
      console.log('[AI ROUTING] Search grounding context retrieved:', searchResultsContext);
    } else {
      console.log('[AI ROUTING] No web search needed.');
    }

    return await executeWithFallback(
      // Gemini Handler
      async (genAIInstance, modelName) => {
        const currentRefDate = `\n\nIMPORTANTE: A data/hora atual de referência do sistema é exatamente: ${new Date().toLocaleString('pt-BR')}. Qualquer menção a termos relativos ("hoje", "amanhã", "depois de amanhã", "esta sexta", etc.) deve ser agendada estritamente em relação a esta data de referência. NÃO use as datas históricas obtidas nas buscas da internet se o usuário pediu especificamente para hoje ou uma data relativa.`;
        const model = genAIInstance.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction + currentRefDate + 
            `\n\nPreferências Atuais do Usuário:\n` + JSON.stringify(getPreferences(), null, 2) +
            (searchResultsContext ? `\n\nContexto de Busca na Internet (Fatos reais): ${searchResultsContext}` : '')
        });

        let formattedHistory = [];
        const firstUserIndex = history.findIndex(h => h.sender === 'user');
        if (firstUserIndex !== -1) {
          formattedHistory = history.slice(firstUserIndex).map(h => ({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          }));
        }

        const chat = model.startChat({
          history: formattedHistory,
          generationConfig: {
            maxOutputTokens: 1000,
          },
          tools: [calendarTools]
        });

        let result = await chat.sendMessage(message);
        let responseText = '';
        let toolCalls = result.response.functionCalls() || [];
        let allExecutedToolCalls = [];

        let turns = 0;
        const maxTurns = 5;

        while (toolCalls.length > 0 && turns < maxTurns) {
          turns++;
          console.log(`[AI] Model requested ${toolCalls.length} tool calls on turn ${turns}.`);
          allExecutedToolCalls.push(...toolCalls);
          const toolResponses = [];

          for (const call of toolCalls) {
            const { name, args } = call;
            console.log(`[AI TOOL CALLING] Executing function: ${name} with args:`, args);

            let functionResult;
            try {
              if (name === 'list_calendar_events') {
                functionResult = await listEvents(args.timeMin, args.timeMax);
              } else if (name === 'create_calendar_event') {
                functionResult = await insertEvent({
                  summary: args.summary,
                  location: args.location,
                  description: args.description || 'Criado via Assistente Virtual ScheduleAI',
                  start: { dateTime: args.startTime },
                  end: { dateTime: args.endTime }
                });
              } else if (name === 'delete_calendar_event') {
                functionResult = await deleteEvent(args.eventId);
              } else if (name === 'check_travel_time') {
                functionResult = await getTravelTime(getPreferences().origin, args.destination, args.transportMode);
              } else if (name === 'get_daily_time_budget') {
                functionResult = await calculateDailyBudget(args.date);
              } else if (name === 'create_goal_intent') {
                functionResult = await planGoalIntent({
                  title: args.title,
                  frequency: args.frequency,
                  durationMinutes: args.durationMinutes,
                  preferredPeriod: args.preferredPeriod,
                  startDate: args.startDate
                });
              } else if (name === 'create_reverse_plan') {
                functionResult = await planReverseDeadline(args.deadline, args.projectTitle);
              } else if (name === 'compare_scheduling_days') {
                functionResult = await compareSchedulingDays(args.day1, args.day2);
              } else if (name === 'list_tasks') {
                functionResult = listTasks();
              } else if (name === 'create_task') {
                functionResult = insertTask({
                  summary: args.summary,
                  description: args.description,
                  estimatedDuration: args.estimatedDuration,
                  priority: args.priority,
                  requiredEnergy: args.requiredEnergy,
                  deadline: args.deadline,
                  context: args.context
                });
              } else if (name === 'update_user_preferences') {
                functionResult = setPreferences(args);
              } else if (name === 'search_contacts') {
                functionResult = await searchGoogleContacts(args.query);
              } else if (name === 'create_contact') {
                functionResult = await createGoogleContact(args);
              } else {
                functionResult = { error: `Function ${name} not found.` };
              }
            } catch (err) {
              console.error(`Tool execution error: ${name}`, err);
              functionResult = { error: err.message };
            }

            toolResponses.push({
              functionResponse: {
                name: name,
                response: { result: functionResult }
              }
            });
          }

          console.log(`[AI] Sending tool responses for turn ${turns}...`);
          result = await chat.sendMessage(toolResponses);
          toolCalls = result.response.functionCalls() || [];
        }

        responseText = result.response.text();

        return {
          text: responseText,
          toolCalls: allExecutedToolCalls
        };
      },
      // Ollama Handler
      async (modelName) => {
        return await callOllama(modelName, message, history, searchResultsContext);
      },
      message
    );
  } catch (error) {
    console.error('Error during chatWithAssistant execution:', error);
    return await handleMockAIChat(message, history);
  }
};

export const checkSingleModelHealth = async (model) => {
  if (model.startsWith('gemini-')) {
    if (keyPool.length === 0) {
      return { status: 'inactive', message: 'Nenhuma chave Gemini configurada no .env' };
    }
    
    const keyResults = [];
    let anyActive = false;

    for (const keyInfo of keyPool) {
      try {
        const testGenAI = new GoogleGenerativeAI(keyInfo.key);
        const testModel = testGenAI.getGenerativeModel({ model });
        
        const generatePromise = testModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'responder apenas OK' }] }],
          generationConfig: { maxOutputTokens: 2 }
        });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout de 5s')), 5000)
        );
        
        const result = await Promise.race([generatePromise, timeoutPromise]);
        const text = result.response.text();
        
        if (text) {
          keyResults.push(`${keyInfo.name}: Ativa`);
          anyActive = true;
        } else {
          keyResults.push(`${keyInfo.name}: Sem resposta`);
        }
      } catch (error) {
        const errorMsg = error.message || '';
        if (errorMsg.includes('429') || errorMsg.includes('Quota exceeded') || errorMsg.includes('quota') || errorMsg.includes('503')) {
          keyInfo.blacklistedUntil = Date.now() + 60 * 60 * 1000; // Blacklist 1h
          keyResults.push(`${keyInfo.name}: Cota Excedida (429)`);
        } else {
          keyResults.push(`${keyInfo.name}: Erro (${errorMsg.substring(0, 40)})`);
        }
      }
    }

    const combinedMessage = `Chaves: ${keyResults.map(r => `[${r}]`).join(' ')}`;
    return {
      status: anyActive ? 'active' : 'inactive',
      message: combinedMessage
    };
  } else {
    // Ollama model
    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: model,
        prompt: 'responder apenas OK',
        stream: false,
        options: {
          num_predict: 2
        }
      }, { timeout: 20000 }); // 20 seconds timeout for cold starts
      
      if (response.data && response.data.response) {
        return { status: 'active', message: 'Funcional - Respondendo localmente via Ollama.' };
      } else {
        return { status: 'inactive', message: 'Respondendo via Ollama, mas sem texto de retorno.' };
      }
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        return { status: 'inactive', message: 'Serviço Ollama fora do ar (conexão recusada).' };
      }
      if (err.message && err.message.includes('timeout')) {
        return { status: 'inactive', message: 'Timeout ao carregar/processar modelo no Ollama (20s).' };
      }
      if (err.response && err.response.status === 404) {
        return { status: 'inactive', message: 'Modelo não está baixado ou não existe no Ollama.' };
      }
      return { status: 'inactive', message: `Erro Ollama: ${err.message}` };
    }
  }
};

export const checkModelsHealth = async () => {
  const prefs = getPreferences();
  const models = prefs.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'];
  
  const results = {};
  for (const model of models) {
    const res = await checkSingleModelHealth(model);
    results[model] = res;
  }
  
  return results;
};

const addWavHeader = (pcmBuffer, sampleRate = 24000) => {
  const header = Buffer.alloc(44);
  
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
};

export const synthesizeSpeech = async (text) => {
  const genAIInstance = getGenAIClient();
  if (!genAIInstance) {
    throw new Error('Nenhuma chave Gemini disponível ou configurada.');
  }

  console.log(`[AI TTS] Synthesizing speech for text: "${text.substring(0, 40)}..."`);
  const model = genAIInstance.client.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-tts'
  });

  const cleanText = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold markdown tags before speaking
  const prompt = `Fale o texto a seguir de forma natural em português, sem adicionar comentários ou introduções. Fale exatamente isso:\n\n${cleanText}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO']
    }
  });

  const parts = result.response.candidates?.[0]?.content?.parts || [];
  if (parts.length > 0 && parts[0].inlineData) {
    const pcmBase64 = parts[0].inlineData.data;
    const pcmBuffer = Buffer.from(pcmBase64, 'base64');
    const wavBuffer = addWavHeader(pcmBuffer, 24000);
    return wavBuffer.toString('base64');
  }

  throw new Error('Nenhum dado de áudio foi retornado pelo Gemini.');
};
