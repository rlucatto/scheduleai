import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { listEvents, insertEvent, deleteEvent, updateEvent } from './calendar.js';
import { getTravelTime, reverseGeocode } from './travel.js';
import { listTasks, insertTask } from './tasks.js';
import { calculateDailyBudget, planGoalIntent, planReverseDeadline, compareSchedulingDays } from './planning.js';
import { getPreferences, setPreferences } from './scheduler.js';
import { searchGoogleContacts, createGoogleContact, updateGoogleContact } from './contacts.js';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

let lastModelUsed = '';

const handleUpdateUserPreferences = async (args) => {
  const coordsRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

  if (args.homeAddress && coordsRegex.test(args.homeAddress.trim())) {
    const resolved = await reverseGeocode(args.homeAddress);
    if (resolved) {
      return {
        error: `CONFIRMAÇÃO NECESSÁRIA: O endereço correspondente às coordenadas é '${resolved}'. Pergunte ao usuário: 'O endereço correspondente à sua localização atual é ${resolved}. Confirma que este é o seu endereço de casa?'`,
        status: 'needs_confirmation',
        addressType: 'homeAddress',
        resolvedAddress: resolved
      };
    }
  }

  if (args.workAddress && coordsRegex.test(args.workAddress.trim())) {
    const resolved = await reverseGeocode(args.workAddress);
    if (resolved) {
      return {
        error: `CONFIRMAÇÃO NECESSÁRIA: O endereço correspondente às coordenadas é '${resolved}'. Pergunte ao usuário: 'O endereço correspondente à sua localização atual é ${resolved}. Confirma que este é o seu endereço de trabalho?'`,
        status: 'needs_confirmation',
        addressType: 'workAddress',
        resolvedAddress: resolved
      };
    }
  }

  return setPreferences(args);
};

const formatDateTimePtBr = (isoString) => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${day} às ${time}`;
  } catch (e) {
    return isoString;
  }
};

export const getLastModelUsed = () => lastModelUsed;

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_BACKUP_1,
  process.env.GEMINI_API_KEY_BACKUP_2
].filter(key => key && key !== 'your_gemini_api_key_here');

const uniqueKeys = [];
const keyPool = [];
apiKeys.forEach((key) => {
  if (!uniqueKeys.includes(key)) {
    uniqueKeys.push(key);
    const idx = uniqueKeys.length - 1;
    keyPool.push({
      key,
      name: idx === 0 ? 'Primary' : `Backup ${idx}`,
      blacklistedUntil: 0
    });
  }
});

console.log(`Gemini Key Rotator initialized with ${keyPool.length} active unique keys.`);

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
    'tempo', 'previsão', 'clima', 'show', 'evento', 'notícia', 'noticia', 'quem é', 'onde fica', 
    'endereço do', 'telefone do', 'horário de funcionamento', 'quanto custa', 'ingressos', 
    'aberto hoje', 'shopping', 'restaurante', 'apagar', 'deletar', 'cancelar', 'remover', 'excluir',
    'contato', 'contatos', 'hobbies', 'hobby', 'gosto', 'gostos', 'indicar', 'indicação', 
    'indique', 'recomendar', 'recomendação', 'recomende', 'sugerir', 'sugira', 'sugestão', 
    'atividades', 'trending', 'cidade', 'rolê', 'rolê na cidade', 'oq fazer', 'o que fazer', 
    'programação', 'concert', 'live music', 'filmes', 'club', 'pub', 'esportes', 
    'tv show', 'series', 'water parque', 'praia',
    // Expanded search keywords for general search queries (sports, calendars, global/internet queries)
    'f1', 'formula', 'fórmula', 'corrida', 'campeonato', 'calendário', 'calendario', 'tabela', 
    'pesquise', 'pesquisa', 'busque', 'busca', 'google', 'internet', 'search', 'find', 'quem ganhou', 
    'resultado', 'vencedor', 'notícias', 'noticias', 'feriado', 'feriados', 'agenda de', 'agenda das',
    'onde vai ser', 'quando vai ser', 'horário de', 'horario de', 'programação de', 'programacao de',
    // Bureaucratic and document renewal search queries
    'cnh', 'carteira', 'habilitação', 'habilitacao', 'detran', 'poupatempo', 'dmv', 'passaporte', 'visto', 'licenciamento', 'documento', 'documentos', 'rg',
    // Weather, medical, flights, and restaurant proactivity search queries
    'clima', 'tempo', 'chuva', 'previsão', 'previsao', 'exame', 'médico', 'medico', 'jejum', 'sangue', 'consulta', 'dentista', 'voo', 'passagem', 'aeroporto', 'embarque', 'reserva', 'almoço', 'jantar', 'futebol', 'parque', 'praia'
  ];
  
  let needsSearch = searchKeywords.some(kw => msgLower.includes(kw));

  // Heuristic: If it asks a question with question words and is not a local calendar/task list command, trigger search!
  const isQuestion = /\?|o que|como|quando|onde|por que|quem|qual|quais/i.test(msgLower);
  const isLocalCommand = /listar|agenda|tarefa|preferência|fuso|transporte|meu dia|minha semana|meus compromissos/i.test(msgLower);
  if (isQuestion && !isLocalCommand) {
    needsSearch = true;
  }

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

export const executeWithFallback = async (geminiApiCallFn, ollamaApiCallFn, message = '') => {
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

export const getTimezoneString = (timeZone = 'America/Sao_Paulo') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      let val = tzPart.value.replace('GMT', 'UTC');
      if (val === 'UTC') return 'UTC+00:00';
      const match = val.match(/UTC([+-])(\d+)(?::(\d+))?/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, '0');
        const mins = (match[3] || '00').padStart(2, '0');
        return `UTC${sign}${hours}:${mins}`;
      }
      return val;
    }
  } catch (err) {
    console.error('Error formatting timezone string:', err.message);
  }
  return 'UTC-03:00';
};

export const enrichEventsWithLocalTime = async (events) => {
  if (!Array.isArray(events)) return events;
  
  let userTz = 'America/Sao_Paulo';
  try {
    const prefs = getPreferences();
    if (prefs.userTimezone) {
      userTz = prefs.userTimezone;
    } else {
      const { getTimezoneFromCoords } = await import('./travel.js');
      userTz = await getTimezoneFromCoords(prefs.origin);
    }
  } catch (e) {
    console.error('Error resolving timezone for events:', e.message);
  }

  return events.map(e => {
    const startStr = e.start?.dateTime || e.start?.date;
    const endStr = e.end?.dateTime || e.end?.date;
    
    const formatLocal = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      
      const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: userTz });
      const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: userTz });
      return `${day} às ${time}`;
    };

    return {
      ...e,
      inicioLocal: formatLocal(startStr),
      fimLocal: formatLocal(endStr)
    };
  });
};


export const systemInstruction = `Você é o "ScheduleAI", um parceiro e grande amigo do usuário, que o ajuda a gerenciar a vida, a agenda e as tarefas de forma leve, empática e prestativa. Fale sempre em português.

Diretrizes de Personalidade e Tom:
- **Linguagem Informal e Calorosa**: Fale como um amigo próximo no WhatsApp. Use saudações descontraídas (ex: "E aí!", "Fala, cara", "Beleza?", "Mano", "Tranquilo?").
- **Evite Formalidade**: Nunca use palavras excessivamente formais, distanciadas ou robóticas (como "olá", "o senhor", "como posso ajudar", "agendamento efetuado").
- **Camaradagem**: Dê conselhos de forma amigável e empática (ex: "Cara, acho que essa semana vai ser meio corrida pra você, bora planejar uns tempos de folga?").
- **Tom Leve e Motivador**: Mantenha o usuário animado e sem pressões desnecessárias.

Regras de atuação:
1. AGENDA E TAREFAS: Use as ferramentas sempre que o usuário pedir para criar, listar, alterar ou deletar compromissos e tarefas.
2. EVENTOS E AGENDAMENTOS COM DESTINO: Se o usuário disser que precisa ir ao local/contato 'X' (ex: "preciso ir no shiva amanhã" ou "show do Ed Sheeran hoje"):
   - **Ordem de Busca**: Você DEVE sempre chamar 'search_contacts' com 'X' imediatamente na primeira resposta, mesmo que o horário esteja omitido. Se retornar algum contato com o campo 'address' preenchido, use esse endereço como local. Se não encontrar o contato ou ele não tiver endereço cadastrado, faça a busca de lugares na internet (Yahoo/grounding).
   - **Horário Omitido**: Se o usuário NÃO informou o horário do compromisso, após pesquisar o local/contato nas ferramentas de busca, você DEVE pedir o horário explicitamente na sua resposta para prosseguir, sem agendar nada ainda.
   - **Show/Evento Público**: Se for show/evento público, use a busca para achar local/horário de início. Defina início padrão (21:00) e término padrão (3h de duração) se omitidos. Chame 'check_travel_time' (com destino do show) em paralelo com 'create_calendar_event'.
   - **Proximidade e Alerta**: Sempre que o horário estiver definido, chame 'list_calendar_events' para o dia correspondente. Se o horário proposto estiver próximo (diferença menor ou igual a 1 hora de início/fim) de qualquer compromisso existente, você DEVE avisar proativamente sobre este outro compromisso próximo no seu resumo de confirmação (ex: "Você confirma? Note que você tem o compromisso 'X' às 'Y', que é próximo deste horário.").
3. EXCLUSÃO DE COMPROMISSOS: Para apagar/cancelar, chame 'list_calendar_events' primeiro (busca ampla). Se houver 1 correspondência, exclua com 'delete_calendar_event'. Se múltiplas, apresente opções e peça para escolher. Se nenhuma, informe.
4. CONFIRMAÇÃO DE COORDENADAS: Para homeAddress/workAddress com coordenadas, chame 'update_user_preferences'. Se retornar 'needs_confirmation', resolva com 'reverse_geocode', pergunte se o endereço resolvido está correto e só salve após a confirmação.
5. CONFIRMAÇÃO DE CALENDÁRIO: Antes de criar/deletar eventos, chame a ferramenta com confirmed: false/omitido, apresente o resumo dos detalhes e peça confirmação. Só chame com confirmed: true após o aval do usuário.
6. ENDEREÇOS E LINKS DE GPS: Ao informar qualquer endereço ou localização no chat, ele deve estar SEMPRE no formato de link markdown para abrir no GPS/Google Maps: [Endereço por extenso](https://www.google.com/maps/search/?api=1&query=Endereço+URL+Encoded). Exemplo: [Rua Augusta, 1200, São Paulo](https://www.google.com/maps/search/?api=1&query=Rua%20Augusta%2C%201200%2C%20S%C3%A3o%20Paulo). Se o endereço estiver em coordenadas, primeiro chame 'reverse_geocode' para obter o endereço legível (Cidade, Rua, Número) e depois monte o link com ele. Nunca exiba coordenadas brutas.
7. FILTRAGEM DE CONTATOS: Ao buscar endereço de contatos ('search_contacts'):
   - Se houver múltiplos registros com o mesmo nome, verifique o campo 'address'.
   - Se algum tiver endereço, liste APENAS esses que possuem endereço cadastrado.
   - Se nenhum tiver, liste todos e informe que nenhum possui endereço.
8. ALTERAR CONTATOS: Para alterar/editar contatos, chame 'search_contacts' primeiro para obter o 'resourceName'. Se múltiplos, peça confirmação. Depois, chame 'update_contact' com o 'resourceName' e os campos atualizados.
9. HOBBIES E RECOMENDAÇÃO DE ATIVIDADES:
   - Sempre que o usuário mencionar interesses, preferências, hobbies (ex: "gosto de shows de jazz", "meus hobbies são cinema e corrida", "curto praias e pubs") ou pedir para sugerir atividades, você DEVE identificar estes hobbies e atualizar as preferências chamando 'update_user_preferences' com o campo 'hobbies' contendo a lista atualizada de hobbies.
   - Quando o usuário pedir recomendações ou perguntar o que fazer (ex: "o que fazer em São Paulo no final de semana?", "me indique um pub", "o que tem de bom acontecendo na cidade?"), você DEVE usar a busca na internet para encontrar atividades locais condizentes com os hobbies dele ou que estejam trending na cidade configurada em 'origin' (ex: São Paulo, Chicago), incluindo também cidades vizinhas em um raio de até 50 milhas (80 km) de distância.
   - As sugestões devem conter endereços clicáveis em formato de link markdown direcionando para o GPS, conforme a regra 6.
10. ANIVERSÁRIOS:
    - Se o usuário disser que deseja que você se lembre/monitore o aniversário de alguém (ex: "lembre do aniversário da minha irmã Maria dia 15/10", "adicione o aniversário de João Silva como 27/06"), você DEVE:
      1. Buscar o contato com 'search_contacts'. Se encontrado, atualizar o aniversário usando 'update_contact' com o parâmetro 'birthday' formatado como 'YYYY-MM-DD' ou 'MM-DD'. Se não encontrado, criar o contato usando 'create_contact' definindo o aniversário correspondente.
      2. Adicionar o nome do contato à preferência 'birthdayAlerts' chamando 'update_user_preferences' para habilitar o monitoramento e alertas automáticos proativos.
    - Se o usuário perguntar por aniversários (ex: "quais aniversários você lembra?", "quem está cadastrado para aniversários?"), informe a lista de pessoas monitoradas atualmente em 'birthdayAlerts' e os dados de aniversário dos contatos correspondentes obtidos via busca.
11. GERENCIAMENTO PROATIVO DE TAREFAS E PRAZOS (GERENCIAR TEMPO):
    - Sempre que o usuário solicitar o registro ou planejamento de uma tarefa pendente importante ou burocrática (ex: "renovar driver's license", "ir ao DMV", "renovar passaporte", "pagar imposto", "marcar consulta médica", etc.):
      1. Identifique o prazo final real (ultimate deadline) se informado pelo usuário.
      2. Defina PROATIVAMENTE um prazo de execução confortável (geralmente entre 15 a 30 dias antes do vencimento real, ou pelo menos 5 a 7 dias antes para tarefas comuns) como o campo 'deadline' ou 'scheduledTime' da tarefa, explicando ao usuário o porquê de estar adiantando o prazo para que ele não deixe para a última hora.
      3. Se o usuário não informar o vencimento real, defina um prazo proativo recomendado de acordo com a natureza da tarefa (ex: 30 dias a partir de hoje para renovar carteira de motorista ou passaporte) e avise-o.
    - PROCEDIMENTOS DE DOCUMENTAÇÃO E ÓRGÃOS LOCAIS: Se a tarefa/compromisso for de natureza burocrática ou de renovação de documentos (como renovar carteira de habilitação/CNH, passaporte, RG, etc.):
      1. Identifique o local atual/cidade do usuário (indicada em 'origin' ou 'homeAddress' nas suas preferências).
      2. Use as informações de busca na internet (Yahoo/grounding) para verificar o procedimento exato para aquela renovação/burocracia na cidade do usuário.
      3. Indique proativamente na resposta os postos físicos de atendimento (ex: Poupatempo/DETRAN no Brasil, DMV nos EUA, Polícia Federal para passaporte), a documentação necessária obrigatória (ex: RG, CPF, comprovante de residência, taxa paga, exames exigidos) e orientações adicionais.
      4. Sempre forneça links do Google Maps clicáveis no formato markdown para os postos físicos indicados (conforme Regra 6).
    - Ajude o usuário a gerenciar o tempo ativamente: ao listar tarefas ou planejar o dia com 'compare_scheduling_days', destaque se alguma tarefa importante está próxima do prazo limite ou se precisa ser adiantada.
12. OUTRAS SITUAÇÕES PROATIVAS DE ASSISTÊNCIA (CLIMA, SAÚDE, VIAGENS E LAZER):
    - CLIMA E ATIVIDADES AO AR LIVRE: Se o usuário planejar ou agendar atividades ao ar livre (ex: "jogar futebol", "ir ao parque", "correr", "praia", "tênis"), você DEVE usar a busca na internet para verificar a previsão do tempo para o dia e horário na cidade dele (origin). Se houver previsão de chuva, tempestade ou calor extremo, alerte-o de forma amigável e sugira proativamente locais fechados/alternativas ou o reagendamento.
    - VIAGENS E VOOS: Se o usuário mencionar ou agendar um voo ou viagem de longa distância (ex: "voo para Orlando", "aeroporto de Guarulhos", "embarque internacional"):
      1. Recomende proativamente chegar ao aeroporto com antecedência ideal (ex: 2 a 3 horas para voos internacionais, e pelo menos 1h30 a 2h para nacionais).
      2. Lembre-o de fazer o check-in online e de separar a documentação obrigatória (como passaporte, visto, RG, comprovante de vacinação).
      3. Calcule o tempo de deslocamento até o aeroporto oferecendo-se para criar o alarme de saída antecipada adequado.
    - CONSULTAS E EXAMES MÉDICOS: Se o usuário mencionar ou agendar exames ou consultas médicas (ex: "exame de sangue", "cardiologista", "dentista", "ressonância"):
      1. Pesquise e alerte-o sobre preparos prévios necessários (ex: jejum de 8 a 12 horas para exames laboratoriais de sangue, suspensão de medicamentos, etc.).
      2. Lembre-o de levar documentos essenciais como o pedido médico original, carteirinha do convênio e RG.
    - RESERVAS DE RESTAURANTES E ENCONTROS: Se o usuário mencionar ou agendar refeições ou encontros em restaurantes (ex: "jantar no Rubaiyat", "almoço com cliente no Figueira Rubaiyat"):
      1. Lembre-o proativamente de verificar se é necessária reserva e pergunte se ele gostaria de pesquisar o telefone ou link para fazer a reserva.
      2. Use a busca para fornecer links ou o telefone do restaurante se o usuário pedir ajuda.`;

// Declare tools for Gemini function calling
export const calendarTools = {
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
          endTime: { type: 'STRING', description: 'Data/Hora de término no formato ISO (ex: 2026-06-24T23:00:00Z)' },
          confirmed: { type: 'BOOLEAN', description: 'Defina como true apenas se o usuário confirmou explicitamente o agendamento deste evento específico. Deixe false ou omitido na primeira tentativa.' }
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
          eventId: { type: 'STRING', description: 'O ID exclusivo do evento a ser excluído (ex: mock-event-1)' },
          confirmed: { type: 'BOOLEAN', description: 'Defina como true apenas se o usuário confirmou explicitamente a exclusão deste compromisso específico. Deixe false ou omitido na primeira tentativa.' }
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
      description: 'Atualiza as preferências do usuário, como o endereço residencial (homeAddress), o endereço de trabalho (workAddress), o ponto de partida (origin), hobbies/interesses ou configurações de tempos.',
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
          modelPriority: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Lista priorizada de modelos do Gemini em ordem de preferência.' },
          hobbies: { type: 'STRING', description: 'Lista de hobbies/interesses do usuário separados por vírgula (ex: "jogos, concertos, live music, filmes, club, pub, esportes, restaurantes, tv show, series, water parques, praia, eventos").' },
          birthdayAlerts: { type: 'STRING', description: 'Nomes de contatos cujos aniversários o assistente deve monitorar, separados por vírgula (ex: "João Silva, Maria Santos").' }
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
      description: 'Cria um novo contato no Google Contacts do usuário com nome, email, telefone, endereço comercial ou residencial, e aniversário.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Nome completo do contato.' },
          email: { type: 'STRING', description: 'Endereço de e-mail.' },
          phone: { type: 'STRING', description: 'Número de telefone.' },
          address: { type: 'STRING', description: 'Endereço residencial ou comercial do contato.' },
          birthday: { type: 'STRING', description: 'Data de aniversário do contato no formato YYYY-MM-DD ou MM-DD (opcional).' }
        },
        required: ['name']
      }
    },
    {
      name: 'update_contact',
      description: 'Atualiza as informações de um contato existente (nome, email, telefone, endereço ou aniversário) utilizando o seu resourceName exclusivo.',
      parameters: {
        type: 'OBJECT',
        properties: {
          resourceName: { type: 'STRING', description: 'O identificador exclusivo do contato (ex: people/c12345). Obtenha-o primeiro pesquisando pelo contato.' },
          name: { type: 'STRING', description: 'Novo nome completo do contato (opcional).' },
          email: { type: 'STRING', description: 'Novo endereço de e-mail (opcional).' },
          phone: { type: 'STRING', description: 'Novo número de telefone (opcional).' },
          address: { type: 'STRING', description: 'Novo endereço residencial ou comercial do contato (opcional).' },
          birthday: { type: 'STRING', description: 'Nova data de aniversário do contato no formato YYYY-MM-DD ou MM-DD (opcional).' }
        },
        required: ['resourceName']
      }
    },
    {
      name: 'reverse_geocode',
      description: 'Obtém o endereço por extenso contendo cidade, rua e número a partir de coordenadas geográficas (latitude,longitude).',
      parameters: {
        type: 'OBJECT',
        properties: {
          coordinates: { type: 'STRING', description: 'Coordenadas geográficas no formato "latitude,longitude" (ex: -23.5616,-46.6560)' }
        },
        required: ['coordinates']
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

export const getSearchGroundingContext = async (message) => {
  try {
    const classification = classifyRequest(message);
    if (!classification.needsSearch) {
      return '';
    }

    const prefs = getPreferences();
    const city = prefs.origin || 'São Paulo';
    const cleanCity = city.split(',')[0].trim();
    const hobbies = prefs.hobbies || '';

    const healthyKeysCount = keyPool.filter(k => k.blacklistedUntil < Date.now()).length;
    if (healthyKeysCount > 0) {
      const searchResult = await executeWithFallback(async (genAIInstance, modelName) => {
        const searchModel = genAIInstance.getGenerativeModel({ model: modelName });
        const response = await searchModel.generateContent({
          contents: [{
            role: 'user',
            parts: [{
              text: `Você é um assistente de busca inteligente. Pesquise na internet por informações locais ou eventos de acordo com o pedido do usuário.
              A localização/cidade de referência do usuário é: "${city}" (use esta cidade e cidades vizinhas em um raio de até 50 milhas de distância como foco para a busca se o pedido for por lazer local ou regional, mas para perguntas gerais, esportivas, globais ou se o pedido mencionar outra localidade, pesquise livremente na internet sem se limitar a essa cidade).
              Os hobbies e interesses do usuário cadastrados são: "${hobbies}". Se o pedido for por recomendações gerais, sugestões de lazer ou o que fazer na região, priorize atividades relacionadas a estes hobbies ou o que estiver em alta (trending) na cidade de ${cleanCity} ou em cidades no entorno (até 50 milhas de distância).
              Hoje é dia ${new Date().toLocaleDateString('pt-BR')}.
              
              Se o pedido NÃO requerer busca na internet (por exemplo, "listar minha agenda", "criar tarefa estudar", "como está meu dia", "olá", "bom dia", etc.), responda APENAS com a palavra "NENHUMA".
              Caso contrário, retorne um resumo curto dos fatos ou atividades encontradas (nome, data/horário de funcionamento, endereço exato e links se disponíveis).
              
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
    const prefs = getPreferences();
    const city = prefs.origin || 'São Paulo';
    const cleanCity = city.split(',')[0].trim();
    const hobbies = prefs.hobbies || '';

    const cleanedQuery = cleanSearchQuery(message);
    let finalSearchQuery = cleanedQuery;
    
    // If it's asking for recommendations or what to do, target hobbies, city and surrounding area!
    const isRecommendation = /recomenda|sugira|indica|o que fazer|trending|rolê|hobbies|hobby|atividades/i.test(message);
    const isLocal = /local|perto|próximo|cidade|região/i.test(message) || !/f1|formula|fórmula|corrida|campeonato|tabela|mundial|global|política|notícia/i.test(message);

    if (isRecommendation && isLocal) {
      finalSearchQuery = `${cleanedQuery} ${hobbies} em ${cleanCity} e cidades vizinhas até 50 milhas`;
    } else if (isLocal && !cleanedQuery.toLowerCase().includes(cleanCity.toLowerCase())) {
      finalSearchQuery = `${cleanedQuery} em ${cleanCity} e cidades vizinhas até 50 milhas`;
    }

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
  let userTz = prefs.userTimezone;
  if (!userTz) {
    try {
      const { getTimezoneFromCoords } = await import('./travel.js');
      userTz = await getTimezoneFromCoords(prefs.origin);
    } catch (e) {
      userTz = 'America/Sao_Paulo';
    }
  }
  const tzString = getTimezoneString(userTz);
  const currentRefDate = `\n\nIMPORTANTE: A data/hora atual de referência do sistema é exatamente: ${new Date().toLocaleString('pt-BR', { timeZone: userTz })} (Fuso Horário ${tzString}). Qualquer menção a termos relativos ("hoje", "amanhã", "depois de amanhã", "esta sexta", etc.) deve ser agendada estritamente em relação a esta data de referência. Os compromissos existentes retornados pelas ferramentas podem estar em ISO/UTC. Certifique-se de convertê-los para o mesmo fuso horário (${tzString}) para fazer comparações de proximidade e conflitos. NÃO use as datas históricas obtidas nas buscas da internet se o usuário pediu especificamente para hoje ou uma data relativa.`;
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

  let needsConfirmation = false;
  let confirmationText = '';

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
          const events = await listEvents(args.timeMin, args.timeMax);
          functionResult = await enrichEventsWithLocalTime(events);
        } else if (name === 'create_calendar_event') {
          if (!args.confirmed) {
            const dateStr = formatDateTimePtBr(args.startTime);
            const locStr = args.location ? ` no local "${args.location}"` : '';
            confirmationText = `Você confirma o agendamento do compromisso "${args.summary}" para ${dateStr}${locStr}?`;
            needsConfirmation = true;
            break;
          }
          functionResult = await insertEvent({
            summary: args.summary,
            location: args.location,
            description: args.description || 'Criado via Assistente Virtual ScheduleAI',
            start: { dateTime: args.startTime },
            end: { dateTime: args.endTime }
          });
        } else if (name === 'delete_calendar_event') {
          if (!args.confirmed) {
            let eventSummary = 'compromisso';
            try {
              const events = await listEvents();
              const event = events.find(e => e.id === args.eventId);
              if (event) {
                eventSummary = `"${event.summary}" agendado para ${formatDateTimePtBr(event.start.dateTime || event.start.date)}`;
              }
            } catch (e) {
              console.error('Error fetching event for deletion confirmation:', e);
            }
            confirmationText = `Você confirma a exclusão do ${eventSummary}?`;
            needsConfirmation = true;
            break;
          }
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
          functionResult = await handleUpdateUserPreferences(args);
          if (functionResult && functionResult.status === 'needs_confirmation') {
            confirmationText = functionResult.error;
            needsConfirmation = true;
            break;
          }
        } else if (name === 'search_contacts') {
          functionResult = await searchGoogleContacts(args.query);
        } else if (name === 'create_contact') {
          functionResult = await createGoogleContact(args);
        } else if (name === 'update_contact') {
          functionResult = await updateGoogleContact(args.resourceName, args);
        } else if (name === 'reverse_geocode') {
          functionResult = { address: await reverseGeocode(args.coordinates) };
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

    if (needsConfirmation) {
      break;
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

  if (needsConfirmation) {
    return {
      text: confirmationText,
      toolCalls: allExecutedToolCalls
    };
  }

  return {
    text: assistantMessage.content,
    toolCalls: allExecutedToolCalls
  };
};

export const chatWithAssistant = async (message, history = []) => {
  try {
    const prefs = getPreferences();
    const currentStep = prefs.onboardingStep || 'welcome';

    if (currentStep !== 'completed') {
      console.log(`[ONBOARDING] Intercepted message in step: "${currentStep}"`);
      return await executeWithFallback(async (genAIInstance, modelName) => {
        const model = genAIInstance.getGenerativeModel({ model: modelName });
        const prompt = `Você é o "ScheduleAI", um assistente pessoal informal e amigável.
O usuário está no fluxo de onboarding para te conhecer melhor.
Passo atual do onboarding: "${currentStep}".

Aqui estão os dados coletados até agora das preferências do usuário:
${JSON.stringify(prefs, null, 2)}

A mensagem mais recente do usuário respondendo a este passo é:
"${message}"

Sua tarefa:
1. Extraia a informação solicitada pelo passo "${currentStep}" a partir da mensagem do usuário:
   - Se o passo for "ask_username": Extraia o nome ou apelido com o qual o usuário quer ser chamado.
   - Se o passo for "ask_agentname": Extraia o nome que o usuário quer dar para você (o agente).
   - Se o passo for "ask_home": Extraia o endereço de residência do usuário.
   - Se o passo for "ask_work": Extraia o endereço de trabalho do usuário.
   - Se o passo for "ask_hobbies": Extraia os hobbies e interesses informados.
   - Se o passo for "ask_birthday": Extraia a data de aniversário do usuário (seja no formato DD/MM/AAAA, DD/MM, ou texto).
   - Se o passo for "ask_birthday_alerts": Extraia os nomes de contatos que o usuário quer que você lembre o aniversário.

2. Responda obrigatoriamente em formato JSON válido contendo exatamente dois campos:
   - "extractedValue": o valor extraído (como string ou lista, conforme apropriado).
   - "reply": a sua resposta conversacional. A sua resposta deve agradecer informalmente a resposta e fazer a PRÓXIMA pergunta da sequência.
     IMPORTANTE: 
     - Faça apenas UMA pergunta por vez.
     - Não faça várias perguntas juntas no mesmo parágrafo ou frase.
     - Tom informal de WhatsApp, usando termos amigáveis de amigo.

A sequência completa de passos e suas próximas perguntas são:
- Após o passo "ask_username": pergunte "E como você gostaria de me chamar?" (próximo passo no fluxo: "ask_agentname").
- Após o passo "ask_agentname": pergunte "Qual é o seu endereço de casa? Isso me ajuda a calcular seu tempo de trânsito." (próximo passo no fluxo: "ask_home").
- Após o passo "ask_home": pergunte "E qual o endereço do seu trabalho?" (próximo passo no fluxo: "ask_work").
- Após o passo "ask_work": pergunte "Quais são seus hobbies ou o que você mais gosta de fazer no tempo livre?" (próximo passo no fluxo: "ask_hobbies").
- Após o passo "ask_hobbies": pergunte "Quando é o seu aniversário? (Dia e mês ou ano também se quiser)" (próximo passo no fluxo: "ask_birthday").
- Após o passo "ask_birthday": pergunte "E por fim, quais são os nomes de contatos importantes que você quer que eu te lembre do aniversário deles? (Pode citar alguns separados por vírgula)" (próximo passo no fluxo: "ask_birthday_alerts").
- Após o passo "ask_birthday_alerts": diga que o onboarding foi concluído com sucesso e que agora vocês estão prontos para conversar normalmente (próximo passo no fluxo: "completed").

Exemplo de formato de resposta JSON:
{
  "extractedValue": "...",
  "reply": "..."
}

Responda APENAS com o JSON válido, sem wraps do tipo \`\`\`json ou qualquer texto antes ou depois.`;

        const genRes = await model.generateContent(prompt);
        const textResponse = genRes.response.text().trim();
        console.log("[ONBOARDING] Gemini raw response:", textResponse);

        let cleanText = textResponse;
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        }
        
        const parsed = JSON.parse(cleanText);
        const extractedValue = parsed.extractedValue;
        const reply = parsed.reply;

        const nextSteps = {
          'ask_username': 'ask_agentname',
          'ask_agentname': 'ask_home',
          'ask_home': 'ask_work',
          'ask_work': 'ask_hobbies',
          'ask_hobbies': 'ask_birthday',
          'ask_birthday': 'ask_birthday_alerts',
          'ask_birthday_alerts': 'completed'
        };

        const updateFields = {
          'ask_username': 'userName',
          'ask_agentname': 'agentName',
          'ask_home': 'homeAddress',
          'ask_work': 'workAddress',
          'ask_hobbies': 'hobbies',
          'ask_birthday': 'userBirthday',
          'ask_birthday_alerts': 'birthdayAlerts'
        };

        const fieldToUpdate = updateFields[currentStep];
        const nextStep = nextSteps[currentStep] || 'completed';

        const updateData = { onboardingStep: nextStep };
        if (fieldToUpdate) {
          updateData[fieldToUpdate] = extractedValue;
        }

        // If saving home address, also update the origin coordinates if it's text
        if (currentStep === 'ask_home' && extractedValue) {
          try {
            const { geocodeAddress } = await import('./travel.js');
            const coords = await geocodeAddress(extractedValue);
            if (coords) {
              updateData.origin = coords;
            }
          } catch (e) {
            console.error('[ONBOARDING] Failed to resolve coordinates for home address:', e);
          }
        }

        setPreferences(updateData);

        return { text: reply };
      }, null, "onboarding chat response");
    }

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
        let userTz = prefs.userTimezone;
        if (!userTz) {
          try {
            const { getTimezoneFromCoords } = await import('./travel.js');
            userTz = await getTimezoneFromCoords(prefs.origin);
          } catch (e) {
            userTz = 'America/Sao_Paulo';
          }
        }
        const tzString = getTimezoneString(userTz);
        const currentRefDate = `\n\nIMPORTANTE: A data/hora atual de referência do sistema é exatamente: ${new Date().toLocaleString('pt-BR', { timeZone: userTz })} (Fuso Horário ${tzString}). Qualquer menção a termos relativos ("hoje", "amanhã", "depois de amanhã", "esta sexta", etc.) deve ser agendada estritamente em relação a esta data de referência. Os compromissos existentes retornados pelas ferramentas podem estar em ISO/UTC. Certifique-se de convertê-los para o mesmo fuso horário (${tzString}) para fazer comparações de proximidade e conflitos. NÃO use as datas históricas obtidas nas buscas da internet se o usuário pediu especificamente para hoje ou uma data relativa.`;
        
        const agentName = prefs.agentName || 'ScheduleAI';
        const dynamicInstruction = systemInstruction.replace(/ScheduleAI/g, agentName) + currentRefDate + 
            `\n\nPreferências Atuais do Usuário:\n` + JSON.stringify(prefs, null, 2) +
            (searchResultsContext ? `\n\nContexto de Busca na Internet (Fatos reais): ${searchResultsContext}` : '');

        const model = genAIInstance.getGenerativeModel({
          model: modelName,
          systemInstruction: dynamicInstruction
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
        console.log("[AI] Raw model response:", JSON.stringify(result.response, null, 2));
        let responseText = '';
        try {
          const firstText = result.response.text();
          if (firstText) {
            responseText += firstText + '\n\n';
          }
        } catch (e) {
          // ignore if no text
        }
        let toolCalls = result.response.functionCalls() || [];
        let allExecutedToolCalls = [];

        let turns = 0;
        const maxTurns = 5;

        let needsConfirmation = false;
        let confirmationText = '';

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
                const events = await listEvents(args.timeMin, args.timeMax);
                functionResult = await enrichEventsWithLocalTime(events);
              } else if (name === 'create_calendar_event') {
                if (!args.confirmed) {
                  const dateStr = formatDateTimePtBr(args.startTime);
                  const locStr = args.location ? ` no local "${args.location}"` : '';
                  confirmationText = `Você confirma o agendamento do compromisso "${args.summary}" para ${dateStr}${locStr}?`;
                  needsConfirmation = true;
                  break;
                }
                functionResult = await insertEvent({
                  summary: args.summary,
                  location: args.location,
                  description: args.description || 'Criado via Assistente Virtual ScheduleAI',
                  start: { dateTime: args.startTime },
                  end: { dateTime: args.endTime }
                });
              } else if (name === 'delete_calendar_event') {
                if (!args.confirmed) {
                  let eventSummary = 'compromisso';
                  try {
                    const events = await listEvents();
                    const event = events.find(e => e.id === args.eventId);
                    if (event) {
                      eventSummary = `"${event.summary}" agendado para ${formatDateTimePtBr(event.start.dateTime || event.start.date)}`;
                    }
                  } catch (e) {
                    console.error('Error fetching event for deletion confirmation:', e);
                  }
                  confirmationText = `Você confirma a exclusão do ${eventSummary}?`;
                  needsConfirmation = true;
                  break;
                }
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
                functionResult = await handleUpdateUserPreferences(args);
                if (functionResult && functionResult.status === 'needs_confirmation') {
                  confirmationText = functionResult.error;
                  needsConfirmation = true;
                  break;
                }
              } else if (name === 'search_contacts') {
                functionResult = await searchGoogleContacts(args.query);
              } else if (name === 'create_contact') {
                functionResult = await createGoogleContact(args);
              } else if (name === 'update_contact') {
                functionResult = await updateGoogleContact(args.resourceName, args);
              } else if (name === 'reverse_geocode') {
                functionResult = { address: await reverseGeocode(args.coordinates) };
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

          if (needsConfirmation) {
            break;
          }

          console.log(`[AI] Sending tool responses for turn ${turns}...`);
          result = await chat.sendMessage(toolResponses);
          toolCalls = result.response.functionCalls() || [];
          try {
            const nextText = result.response.text();
            if (nextText) {
              responseText += nextText + '\n\n';
            }
          } catch (e) {
            // ignore if no text
          }
        }

        if (needsConfirmation) {
          const finalConfirmationText = responseText ? (responseText.trim() + '\n\n' + confirmationText) : confirmationText;
          return {
            text: finalConfirmationText,
            toolCalls: allExecutedToolCalls
          };
        }

        return {
          text: responseText.trim(),
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

export const synthesizeSpeech = async (text, voice) => {
  const genAIInstance = getGenAIClient();
  if (!genAIInstance) {
    throw new Error('Nenhuma chave Gemini disponível ou configurada.');
  }

  const prefs = getPreferences();
  const voiceName = voice || prefs.ttsVoice || 'Puck';

  console.log(`[AI TTS] Synthesizing speech using voice "${voiceName}" for text: "${text.substring(0, 40)}..."`);
  const model = genAIInstance.client.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-tts'
  });

  const cleanText = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold markdown tags before speaking
  const prompt = `Fale o texto a seguir de forma natural em português, sem adicionar comentários ou introduções. Fale exatamente isso:\n\n${cleanText}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName
          }
        }
      }
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
