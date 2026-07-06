import axios from 'axios';

const run = async () => {
  try {
    console.log('Fetching production models health...');
    const healthRes = await axios.get('https://scheduleai-hz68.onrender.com/api/models/health');
    console.log('--- PRODUCTION MODELS HEALTH ---');
    console.log(JSON.stringify(healthRes.data, null, 2));

    console.log('\nFetching production preferences...');
    const prefsRes = await axios.get('https://scheduleai-hz68.onrender.com/api/preferences');
    console.log('--- PRODUCTION PREFERENCES ---');
    console.log(JSON.stringify(prefsRes.data, null, 2));
  } catch (err) {
    console.error('Failed:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
  }
};

run();
