import axios from 'axios';

const run = async () => {
  try {
    const query = 'show ed sheeran';
    console.log(`Querying DuckDuckGo HTML for: "${query}"...`);
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const html = response.data;
    console.log("HTML length:", html.length);
    // Find some snippets or look at snippet tags
    console.log("Does it contain class='result__snippet'?", html.includes('result__snippet'));
    console.log("Does it contain result-snippet?", html.includes('result-snippet'));
    console.log("Does it contain 'snippet'?", html.includes('snippet'));
    console.log("Does it contain 'result'?", html.includes('result'));
    
    // Print first 3000 chars of body or search results area
    const bodyStart = html.indexOf('<body');
    if (bodyStart !== -1) {
      console.log("\n=== HTML Body Excerpt ===");
      console.log(html.substring(bodyStart, bodyStart + 4000));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

run();
