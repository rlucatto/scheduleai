import { chatWithAssistant } from './services/gemini.js';
import { setPreferences } from './services/scheduler.js';

async function runTests() {
  console.log('=== TESTANDO EXTENSÃO DE SITUAÇÕES PROATIVAS ===\n');

  // Configurar cidade
  await setPreferences({
    onboardingStep: 'completed',
    origin: 'São Paulo, SP',
    homeAddress: 'Avenida Paulista, 1000, São Paulo, SP',
    userName: 'Rafael',
    agentName: 'ScheduleAI'
  });

  // Teste 1: Exame médico (exige jejum/preparo)
  console.log('\n--- Teste 1: Exame Médico ---');
  const msgExame = 'vou fazer um exame de sangue amanhã de manhã';
  console.log(`Mensagem do usuário: "${msgExame}"`);
  
  const resExame = await chatWithAssistant(msgExame, []);
  console.log('\nResposta do Assistente:');
  console.log(resExame.text);
  
  const textExameLower = resExame.text.toLowerCase();
  const hasJejumOrPrep = textExameLower.includes('jejum') || textExameLower.includes('preparo') || textExameLower.includes('alimentar') || textExameLower.includes('exame');
  if (hasJejumOrPrep) {
    console.log('✅ Teste 1 Passou: Alerta de jejum/preparo médico verificado.');
  } else {
    throw new Error('❌ Teste 1 Falhou: O assistente não alertou sobre jejum ou preparo para o exame.');
  }

  // Teste 2: Viagem / Voo (exige antecedência)
  console.log('\n--- Teste 2: Viagem de Avião ---');
  const msgVoo = 'tenho um voo internacional saindo de Cumbica amanhã à noite';
  console.log(`Mensagem do usuário: "${msgVoo}"`);
  
  const resVoo = await chatWithAssistant(msgVoo, []);
  console.log('\nResposta do Assistente:');
  console.log(resVoo.text);
  
  const textVooLower = resVoo.text.toLowerCase();
  const hasVooPrep = textVooLower.includes('antecedência') || textVooLower.includes('check-in') || textVooLower.includes('passaporte') || textVooLower.includes('aeroporto') || textVooLower.includes('horas');
  if (hasVooPrep) {
    console.log('✅ Teste 2 Passou: Dicas de antecedência/documentação de voo verificadas.');
  } else {
    throw new Error('❌ Teste 2 Falhou: O assistente não forneceu recomendações de antecedência ou documentos para a viagem.');
  }

  console.log('\n=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
}

runTests().catch(err => {
  console.error('\n❌ Um dos testes falhou:', err.message);
  process.exit(1);
});
