import axios from 'axios';

const runTest = async () => {
  const BACKEND_URL = 'http://localhost:5000';
  
  try {
    console.log('--- Initializing preferences: setting origin to coordinates ---');
    await axios.post(`${BACKEND_URL}/api/preferences`, {
      origin: '-23.5616,-46.6560'
    });
    console.log('Preferences initialized.');

    console.log('\n--- TEST 1: Geolocation Coordinates to Address Confirmation ---');
    // We send a request to set current location as home.
    // The assistant should check the preferences, find origin is coordinates (or use current coordinates),
    // trigger the tool call, get "needs_confirmation" error, and ask the user for confirmation.
    let res = await axios.post(`${BACKEND_URL}/api/assistant/chat`, {
      message: 'Definir minha localização atual como meu endereço de casa',
      history: []
    });
    console.log('AI Response:', res.data.text);
    console.log('Tool Calls:', JSON.stringify(res.data.toolCalls, null, 2));

    const promptMessage = res.data.text;
    const historyWithFirstTurn = [
      { sender: 'user', text: 'Definir minha localização atual como meu endereço de casa' },
      { sender: 'assistant', text: promptMessage }
    ];

    if (promptMessage.toLowerCase().includes('confirm') || promptMessage.toLowerCase().includes('paulista') || promptMessage.toLowerCase().includes('casa') || promptMessage.toLowerCase().includes('correto')) {
      console.log('\n--- TEST 1b: User confirms coordinate address update ---');
      let res2 = await axios.post(`${BACKEND_URL}/api/assistant/chat`, {
        message: 'Sim, está correto, pode salvar.',
        history: historyWithFirstTurn
      });
      console.log('AI Response:', res2.data.text);
      console.log('Tool Calls:', JSON.stringify(res2.data.toolCalls, null, 2));
    }

    console.log('\n--- TEST 2: Calendar Create Event Confirmation ---');
    let res3 = await axios.post(`${BACKEND_URL}/api/assistant/chat`, {
      message: 'Agendar reunião com design hoje das 17h às 18h',
      history: []
    });
    console.log('AI Response:', res3.data.text);
    console.log('Tool Calls:', JSON.stringify(res3.data.toolCalls, null, 2));

    const promptMessageCreate = res3.data.text;
    const historyWithCreateTurn = [
      { sender: 'user', text: 'Agendar reunião com design hoje das 17h às 18h' },
      { sender: 'assistant', text: promptMessageCreate }
    ];

    if (promptMessageCreate.toLowerCase().includes('confirm') || promptMessageCreate.toLowerCase().includes('reunião')) {
      console.log('\n--- TEST 2b: User confirms create event ---');
      let res4 = await axios.post(`${BACKEND_URL}/api/assistant/chat`, {
        message: 'Sim, por favor, agende.',
        history: historyWithCreateTurn
      });
      console.log('AI Response:', res4.data.text);
      console.log('Tool Calls:', JSON.stringify(res4.data.toolCalls, null, 2));
    }
    
  } catch (error) {
    console.error('Error running test:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
};

runTest();
