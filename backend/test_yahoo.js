import axios from 'axios';

const run = async () => {
  try {
    const query = 'show ed sheeran brasil hoje';
    console.log(`Querying Yahoo for: "${query}"...`);
    const response = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const html = response.data;
    
    // Find all occurrences of "compText" or other snippet wrappers in Yahoo
    const rx = /<div class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    const matches = [];
    let match;
    while ((match = rx.exec(html)) !== null && matches.length < 10) {
      const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) matches.push(text);
    }
    
    console.log(`Found ${matches.length} snippets via compText:`);
    matches.forEach((s, idx) => {
      console.log(`[Snippet ${idx + 1}]`, s);
    });

    if (matches.length === 0) {
      // Look for other text elements or spans
      console.log("No compText found. Excerpt around first occurrence of 'compText':");
      const idx = html.indexOf('compText');
      if (idx !== -1) {
        console.log(html.substring(idx - 100, idx + 400));
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

run();
