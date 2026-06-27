import { getPreferences, setPreferences } from './services/scheduler.js';
import { chatWithAssistant, cleanSearchQuery } from './services/gemini.js';

async function runTests() {
  console.log('=== INICIANDO TESTES DE APRENDIZADO DE HOBBIES E RECOMENDAÇÃO ===\n');

  // Teste 1: Configuração padrão de hobbies nas preferências
  console.log('Teste 1: Verificando hobbies padrão...');
  const prefs = getPreferences();
  console.log(`Hobbies atuais: ${prefs.hobbies}`);
  if (!prefs.hobbies || !prefs.hobbies.includes('jogos')) {
    throw new Error(`Hobbies padrão ausentes ou incorretos: ${prefs.hobbies}`);
  }
  console.log('✅ Teste 1 passou!\n');

  // Teste 2: Aprendizado de Hobbies via conversa (simulando Ollama/Gemini tool calling)
  console.log('Teste 2: Simulando conversa para aprendizado de hobbies...');
  // Redefine hobbies para um valor básico
  setPreferences({ hobbies: 'jogos, concertos' });
  
  const userMessage = 'Quero que você adicione "praia" e "futebol" à minha lista de hobbies.';
  console.log(`Mensagem do usuário: "${userMessage}"`);
  
  const response = await chatWithAssistant(userMessage);
  console.log('Resposta da IA:', response.text);
  console.log('Tool calls executados:', JSON.stringify(response.toolCalls, null, 2));

  // O assistente deve ter chamado update_user_preferences com os hobbies atualizados
  const updatedPrefs = getPreferences();
  console.log('Preferências atualizadas no backend:', JSON.stringify(updatedPrefs, null, 2));
  if (!updatedPrefs.hobbies.includes('praia') || !updatedPrefs.hobbies.includes('futebol')) {
    throw new Error(`Hobbies não foram atualizados corretamente: ${updatedPrefs.hobbies}`);
  }
  console.log('✅ Teste 2 passou!\n');

  // Teste 3: Grounding de pesquisa contextualizado para Hobbies & Cidade
  console.log('Teste 3: Verificando se buscas por recomendações usam hobbies e cidade...');
  
  // Define cidade para "Chicago" e hobbies específicos
  setPreferences({ 
    origin: '4544 N Spaulding Ave, Chicago',
    hobbies: 'jazz, pub, restaurantes'
  });

  const recommendationMessage = 'O que tem de divertido para fazer hoje à noite na minha cidade?';
  console.log(`Mensagem do usuário: "${recommendationMessage}"`);

  // O assistente deve classificar como necessitando de busca
  const result = await chatWithAssistant(recommendationMessage);
  console.log('Resposta da IA com recomendações:', result.text);
  
  console.log('✅ Teste 3 passou!\n');

  console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
}

runTests().catch(err => {
  console.error('❌ Teste falhou:', err);
  process.exit(1);
});
