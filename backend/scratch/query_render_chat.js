import axios from 'axios';

const run = async () => {
  try {
    console.log('Sending proactive-greeting request to production Render backend...');
    const res = await axios.get('https://scheduleai-hz68.onrender.com/api/assistant/proactive-greeting');
    console.log('--- PRODUCTION PROACTIVE GREETING RESPONSE ---');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Failed:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
};

run();
