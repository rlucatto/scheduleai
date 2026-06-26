import axios from 'axios';

const testEngine = async (name, url, headers = {}) => {
  try {
    console.log(`\nTesting ${name}: ${url}...`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      },
      timeout: 8000
    });
    const html = response.data;
    console.log(`${name} HTML length:`, html.length);
    console.log(`${name} contains bot block/captcha?`, 
      html.includes('captcha') || 
      html.includes('robot') || 
      html.includes('anomaly') || 
      html.includes('automated requests') || 
      html.includes('detectou tráfego incomum')
    );
    
    // Print snippet matches
    if (name === 'Yahoo') {
      // Yahoo snippet class is usually CompText or fz-ms or fc-carbon
      console.log("Yahoo includes 'compText'?", html.includes('compText'));
      console.log("Yahoo includes 'fz-ms'?", html.includes('fz-ms'));
    } else if (name === 'Ask') {
      // Ask.com snippet class is usually partial-description
      console.log("Ask.com includes 'partial-description'?", html.includes('partial-description'));
    } else if (name === 'Bing') {
      // Bing snippet is usually class b_caption or similar
      console.log("Bing includes 'b_caption'?", html.includes('b_caption'));
    }
    
    return html.substring(0, 1000);
  } catch (error) {
    console.error(`${name} failed:`, error.message);
  }
};

const run = async () => {
  const query = 'show ed sheeran brasil hoje';
  await testEngine('Yahoo', `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`);
  await testEngine('Ask', `https://www.ask.com/web?q=${encodeURIComponent(query)}`);
  await testEngine('Bing', `https://www.bing.com/search?q=${encodeURIComponent(query)}`);
};

run();
