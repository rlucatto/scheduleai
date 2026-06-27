import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000';

async function testProactiveGreeting() {
  console.log('=== TESTANDO ENDPOINT DE SAUDAÇÃO PROATIVA ===');
  try {
    const res = await axios.get(`${BACKEND_URL}/api/assistant/proactive-greeting`);
    
    console.log('Status do Response:', res.status);
    console.log('Data recebida:', res.data);
    
    if (res.data && typeof res.data.text === 'string' && res.data.text.length > 0) {
      console.log('✅ Teste passou! Saudação gerada com sucesso:');
      console.log(`"${res.data.text}"`);
    } else {
      console.error('❌ Teste falhou: O formato da resposta é inválido ou está vazio.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar ao endpoint:', error.message);
    process.exit(1);
  }
}

testProactiveGreeting();
