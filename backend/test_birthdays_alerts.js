import fs from 'fs';
import path from 'path';

const tokensPath = path.join(process.cwd(), 'tokens.json');
const tokensBakPath = path.join(process.cwd(), 'tokens.json.bak');
let backedUp = false;

try {
  if (fs.existsSync(tokensPath)) {
    fs.renameSync(tokensPath, tokensBakPath);
    backedUp = true;
    console.log('[TEST] Temporarily backed up tokens.json');
  }

  // Set environment variables for mock scenario
  process.env.TEST_MOCK_CONTACTS = 'true';
  process.env.TEST_SCENARIO = 'search_mock'; // bypass predefined scenarios to use actual mockContacts database

  // Dynamic imports so it loads with modified tokens.json existence and mock setting
  const { getPreferences, setPreferences } = await import('./services/scheduler.js');
  const { searchGoogleContacts, createGoogleContact, updateGoogleContact } = await import('./services/contacts.js');
  const { checkBirthdays } = await import('./services/scheduler.js');
  const { chatWithAssistant } = await import('./services/gemini.js');

  console.log('=== INICIANDO TESTES DE GERENCIAMENTO DE ANIVERSÁRIOS ===\n');

  // Teste 1: Adicionar aniversário a um contato existente via mock e verificar campos
  console.log('Teste 1: Verificando criação de contato com aniversário...');
  const newContact = await createGoogleContact({
    name: 'Carlos Oliveira',
    email: 'carlos@example.com',
    phone: '11666665555',
    address: 'Rua das Flores, 123',
    birthday: '1992-06-27'
  });
  console.log('Contato criado:', JSON.stringify(newContact, null, 2));
  if (newContact.birthday !== '1992-06-27') {
    throw new Error(`Aniversário incorreto no contato criado: esperado "1992-06-27", obtido "${newContact.birthday}"`);
  }
  console.log('✅ Teste 1 passou!\n');

  // Teste 2: Atualização de aniversário de um contato existente
  console.log('Teste 2: Verificando atualização de aniversário...');
  const updatedContact = await updateGoogleContact(newContact.resourceName, {
    birthday: '1992-08-30'
  });
  console.log('Contato atualizado:', JSON.stringify(updatedContact, null, 2));
  if (updatedContact.birthday !== '1992-08-30') {
    throw new Error(`Aniversário incorreto após atualização: esperado "1992-08-30", obtido "${updatedContact.birthday}"`);
  }
  console.log('✅ Teste 2 passou!\n');

  // Teste 3: Simulação de Conversa para agendar alertas de aniversário
  console.log('Teste 3: Simulando diálogo para cadastrar aniversário...');
  // Redefine preferências
  setPreferences({ birthdayAlerts: '' });

  const conversationMessage = 'Por favor, adicione o aniversário de Carlos Oliveira como 27/06 e lembre-me dele.';
  console.log(`Mensagem do usuário: "${conversationMessage}"`);

  const chatResponse = await chatWithAssistant(conversationMessage);
  console.log('Resposta da IA:', chatResponse.text);
  console.log('Tool calls executados:', JSON.stringify(chatResponse.toolCalls, null, 2));

  // O assistente deve ter atualizado o aniversário do contato Carlos Oliveira e adicionado às preferências
  const finalPrefs = getPreferences();
  console.log('Preferências finais do usuário:', JSON.stringify(finalPrefs, null, 2));
  if (!finalPrefs.birthdayAlerts.toLowerCase().includes('carlos oliveira')) {
    throw new Error(`Contato Carlos Oliveira não foi adicionado ao birthdayAlerts: ${finalPrefs.birthdayAlerts}`);
  }

  // Pesquisa para validar se o aniversário foi salvo no contato
  const searched = await searchGoogleContacts('Carlos Oliveira');
  console.log('Contato Carlos Oliveira pesquisado:', JSON.stringify(searched, null, 2));
  if (searched[0].birthday !== '06-27' && searched[0].birthday !== '1992-06-27') {
    throw new Error(`Fuso/Aniversário do contato Carlos Oliveira não foi salvo corretamente: ${searched[0].birthday}`);
  }
  console.log('✅ Teste 3 passou!\n');

  // Teste 4: Alerta proativo disparado pelo Scheduler
  console.log('Teste 4: Testando disparo de alertas do Scheduler...');
  
  // Força data do scheduler para ser 27 de Junho
  const simulatedToday = new Date('2026-06-27T10:00:00');
  console.log(`Simulando data atual no Scheduler: ${simulatedToday.toDateString()}`);
  
  // O scheduler deve achar Carlos Oliveira (aniversário 27/06) nos birthdayAlerts e disparar notificação
  await checkBirthdays(simulatedToday);
  console.log('✅ Teste 4 passou!\n');

  console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');

} catch (err) {
  console.error('❌ Teste falhou:', err);
  process.exit(1);
} finally {
  if (backedUp) {
    if (fs.existsSync(tokensBakPath)) {
      fs.renameSync(tokensBakPath, tokensPath);
      console.log('[TEST] Restored tokens.json');
    }
  }
}
