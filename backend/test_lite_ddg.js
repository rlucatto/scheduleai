import axios from 'axios';

const run = async () => {
  try {
    const query = 'show ed sheeran';
    console.log(`Querying DuckDuckGo LITE for: "${query}"...`);
    const response = await axios.post(`https://lite.duckduckgo.com/lite/`, `q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 8000
    });
    const html = response.data;
    console.log("LITE HTML length:", html.length);
    console.log("Does LITE contain anomaly/captcha?", html.includes('anomaly') || html.includes('challenge') || html.includes('captcha') || html.includes('bots use'));
    console.log("Does LITE contain 'result'?", html.includes('result') || html.includes('td class="result-snippet"'));

    // Print first 1000 characters of LITE html to check structure
    const bodyStart = html.indexOf('<body');
    if (bodyStart !== -1) {
      console.log("\n=== HTML Body Excerpt ===");
      console.log(html.substring(bodyStart, bodyStart + 1000));
    }
  } catch (error) {
    console.error('LITE Error:', error.message);
  }
};

run();
