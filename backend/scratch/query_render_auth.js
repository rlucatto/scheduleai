import axios from 'axios';

const run = async () => {
  try {
    console.log('Fetching production auth status...');
    const res = await axios.get('https://scheduleai-hz68.onrender.com/api/auth/status');
    console.log('--- PRODUCTION AUTH STATUS ---');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Failed:', err.message);
  }
};

run();
