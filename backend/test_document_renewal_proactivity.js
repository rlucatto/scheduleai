import { chatWithAssistant } from './services/gemini.js';
import { setPreferences } from './services/scheduler.js';

async function runTest() {
  console.log('=== TESTANDO PROATIVIDADE DE RENOVAÇÃO DE DOCUMENTO (CNH) ===\n');

  // 1. Configurar preferências do usuário para São Paulo
  console.log('Passo 1: Configurando preferências com origem: "São Paulo, SP"...');
  await setPreferences({
    onboardingStep: 'completed',
    origin: 'São Paulo, SP',
    homeAddress: 'Avenida Paulista, 1000, São Paulo, SP',
    hobbies: 'tecnologia, café',
    birthdayAlerts: '',
    userName: 'Rafael',
    agentName: 'ScheduleAI'
  });

  // 2. Enviar mensagem informando necessidade de renovar a CNH
  const message = 'preciso renovar minha carteira de habilitação';
  console.log(`\nMensagem do usuário: "${message}"`);
  console.log('Aguardando resposta do assistente (gerando busca e processando)...');
  
  const response = await chatWithAssistant(message, []);
  
  console.log('\n--- RESPOSTA DO ASSISTENTE ---');
  console.log(response.text);
  console.log('------------------------------');

  // 3. Validações
  console.log('\nPasso 3: Validando resposta...');
  
  const textLower = response.text.toLowerCase();
  
  // A. Deve mencionar os órgãos locais esperados (Poupatempo ou DETRAN)
  const hasLocalOrgan = textLower.includes('poupatempo') || textLower.includes('detran');
  if (hasLocalOrgan) {
    console.log('✅ Validação A: Encontrou menção ao órgão local (DETRAN/Poupatempo).');
  } else {
    console.warn('⚠️ Validação A: Não encontrou "Poupatempo" ou "DETRAN" no texto. Verifique a resposta.');
  }

  // B. Deve indicar a documentação necessária (como comprovante de residência, RG, CPF, etc.)
  const hasDocs = textLower.includes('documento') || textLower.includes('rg') || textLower.includes('cpf') || textLower.includes('comprovante');
  if (hasDocs) {
    console.log('✅ Validação B: Encontrou menção à documentação exigida.');
  } else {
    throw new Error('❌ Validação B falhou: A resposta não mencionou documentos requeridos.');
  }

  // C. Deve fornecer links clicáveis do Google Maps no formato markdown
  const mapsRegex = /\[([^\]]+)\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^)]+\)/i;
  const hasMapsLinks = mapsRegex.test(response.text);
  if (hasMapsLinks) {
    console.log('✅ Validação C: Encontrou links clicáveis de GPS no formato markdown.');
  } else {
    throw new Error('❌ Validação C falhou: Não foi encontrado link do Google Maps formatado de acordo com a Regra 6.');
  }

  console.log('\n=== TESTE CONCLUÍDO COM SUCESSO! ===');
}

runTest().catch(err => {
  console.error('\n❌ O teste falhou:', err.message);
  process.exit(1);
});
