import { getPreferences, setPreferences } from './services/scheduler.js';
import { insertTask, listTasks, initMockTasks } from './services/tasks.js';
import { checkTaskDeadlines } from './services/scheduler.js';
import { chatWithAssistant } from './services/gemini.js';

async function runTests() {
  console.log('=== INICIANDO TESTES DE GERENCIAMENTO PROATIVO DE TAREFAS ===\n');

  // Teste 1: Inserção de tarefa burocrática importante com data limite real
  console.log('Teste 1: Verificando criação de tarefa DMV com prazo real de 30/08/2026...');
  initMockTasks(); // clean tasks list
  
  const dmvTask = insertTask({
    summary: 'Renovar drivers license no DMV',
    description: 'Renovação quinquenal da habilitação.',
    deadline: '2026-08-30'
  });
  console.log('Tarefa criada:', JSON.stringify(dmvTask, null, 2));
  
  // Confortable deadline should be 15 days before 2026-08-30 (which is 2026-08-15)
  if (dmvTask.deadline !== '2026-08-15') {
    throw new Error(`Prazo confortável não calculado corretamente: esperado "2026-08-15", obtido "${dmvTask.deadline}"`);
  }
  console.log('✅ Teste 1 passou!\n');

  // Teste 2: Inserção de tarefa burocrática sem data limite informada
  console.log('Teste 2: Verificando criação de tarefa passaporte sem prazo informado...');
  const passportTask = insertTask({
    summary: 'Renovar meu passaporte federal',
    description: 'Ir na Polícia Federal tirar foto.'
  });
  console.log('Tarefa criada:', JSON.stringify(passportTask, null, 2));
  
  // Confortable deadline should be 30 days from now
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + 30);
  const expectedStr = expectedDate.toISOString().split('T')[0];
  
  if (passportTask.deadline !== expectedStr) {
    throw new Error(`Prazo proativo padrão de 30 dias não calculado corretamente: esperado "${expectedStr}", obtido "${passportTask.deadline}"`);
  }
  console.log('✅ Teste 2 passou!\n');

  // Teste 3: Simulação de Conversa para agendar tarefa DMV proativamente
  console.log('Teste 3: Simulando diálogo para criar tarefa de renovação...');
  initMockTasks();

  const conversationMessage = 'Crie a tarefa renovar passaporte vencendo dia 30/08/2026';
  console.log(`Mensagem do usuário: "${conversationMessage}"`);

  const chatResponse = await chatWithAssistant(conversationMessage);
  console.log('Resposta da IA:', chatResponse.text);
  console.log('Tool calls executados:', JSON.stringify(chatResponse.toolCalls, null, 2));

  // The assistant should call create_task with deadline 2026-08-15 (15 days earlier)
  const taskCalls = chatResponse.toolCalls.filter(tc => tc.name === 'create_task');
  if (taskCalls.length === 0) {
    throw new Error('Nenhuma chamada de ferramenta create_task foi efetuada pelo assistente.');
  }
  const calledDeadline = taskCalls[0].args.deadline;
  console.log(`Prazo enviado na chamada da IA: "${calledDeadline}"`);
  if (calledDeadline !== '2026-08-15') {
    throw new Error(`A IA não enviou o prazo proativo adiantado de 15 dias: obtido "${calledDeadline}"`);
  }
  console.log('✅ Teste 3 passou!\n');

  // Teste 4: Alerta proativo do Scheduler para prazos iminentes
  console.log('Teste 4: Testando disparo de alertas do Scheduler para tarefas vencendo hoje...');
  initMockTasks();
  
  const expiringTodayTask = insertTask({
    summary: 'Enviar Imposto de Renda',
    deadline: '2026-06-27'
  });
  console.log('Tarefa expira hoje criada:', JSON.stringify(expiringTodayTask, null, 2));

  // Força data do scheduler para ser 27 de Junho
  const simulatedToday = new Date('2026-06-27T10:00:00');
  console.log(`Simulando data atual no Scheduler: ${simulatedToday.toDateString()}`);
  
  await checkTaskDeadlines(simulatedToday);
  console.log('✅ Teste 4 passou!\n');

  console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
}

runTests().catch(err => {
  console.error('❌ Teste falhou:', err);
  process.exit(1);
});
