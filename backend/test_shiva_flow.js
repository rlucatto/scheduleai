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
  process.env.TEST_SCENARIO = 'shiva_flow';

  // Dynamic import so it loads with modified tokens.json existence
  const { chatWithAssistant } = await import('./services/gemini.js');

  console.log('\n--- Running Shiva Flow Tests ---');

  // Test Case 1: "preciso ir no shiva amanhã" (No hour provided)
  console.log('\n[TEST 1] Sending: "preciso ir no shiva amanhã"');
  let result1 = await chatWithAssistant('preciso ir no shiva amanhã', []);
  console.log('Assistant response:');
  console.log(result1.text);
  console.log('Executed tool calls:', result1.toolCalls.map(tc => tc.name));

  // Verify that it called search_contacts and did not call create_calendar_event or list_calendar_events yet.
  const calledSearchContacts = result1.toolCalls.some(tc => tc.name === 'search_contacts');
  const calledCreateEvent = result1.toolCalls.some(tc => tc.name === 'create_calendar_event');
  
  console.log('\nVerification case 1:');
  console.log('- Called search_contacts:', calledSearchContacts ? 'PASS' : 'FAIL');
  console.log('- Did NOT call create_calendar_event yet:', !calledCreateEvent ? 'PASS' : 'FAIL');

  // Test Case 2: Provide the hour, check for proximity warning.
  // Tomorrow's date:
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = tomorrow.toLocaleDateString('pt-BR');
  
  console.log(`\n[TEST 2] Responding with hour: "às 14:00" (conflict exists tomorrow 14:00-15:00)`);
  const history = [
    { sender: 'user', text: 'preciso ir no shiva amanhã' },
    { sender: 'assistant', text: result1.text }
  ];
  
  let result2 = await chatWithAssistant('às 14:00', history);
  console.log('Assistant response:');
  console.log(result2.text);
  console.log('Executed tool calls:', result2.toolCalls.map(tc => tc.name));

  const calledListEvents = result2.toolCalls.some(tc => tc.name === 'list_calendar_events');
  const hasConflictWarning = result2.text.toLowerCase().includes('conflito') || 
                             result2.text.toLowerCase().includes('reunião') ||
                             result2.text.toLowerCase().includes('próximo') ||
                             result2.text.toLowerCase().includes('compromisso');

  console.log('\nVerification case 2:');
  console.log('- Called list_calendar_events:', calledListEvents ? 'PASS' : 'FAIL');
  console.log('- Warning about proximity/conflict present in response:', hasConflictWarning ? 'PASS' : 'FAIL');

  // Test Case 3: "preciso ir no shiva amanhã" but with scenario shiva_no_address.
  // It should fall back to internet search / search grounding.
  console.log('\n[TEST 3] Scenario: Shiva with no address (should fall back to places/web search)');
  process.env.TEST_SCENARIO = 'shiva_no_address';
  
  let result3 = await chatWithAssistant('preciso ir no shiva amanhã', []);
  console.log('Assistant response:');
  console.log(result3.text);
  console.log('Executed tool calls:', result3.toolCalls.map(tc => tc.name));
  
  const calledSearchContacts3 = result3.toolCalls.some(tc => tc.name === 'search_contacts');
  console.log('\nVerification case 3:');
  console.log('- Called search_contacts:', calledSearchContacts3 ? 'PASS' : 'FAIL');

} catch (err) {
  console.error('[TEST ERROR]', err);
} finally {
  if (backedUp) {
    if (fs.existsSync(tokensBakPath)) {
      fs.renameSync(tokensBakPath, tokensPath);
      console.log('[TEST] Restored tokens.json');
    }
  }
}
