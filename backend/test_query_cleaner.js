import axios from 'axios';

const cleanSearchQuery = (query) => {
  let cleaned = query.toLowerCase();
  
  const stopPhrases = [
    'tenho que ir no', 'tenho que ir ao', 'tenho que ir na', 'tenho que ir para o', 'tenho que ir para a',
    'preciso ir no', 'preciso ir ao', 'preciso ir na', 'preciso ir para o', 'preciso ir para a',
    'vou no', 'vou ao', 'vou na', 'vou para o', 'vou para a',
    'marcar', 'agendar', 'adicionar', 'criar', 'tenho que', 'tenho de', 'preciso',
    'hoje', 'amanhã', 'amanha', 'ontem'
  ];
  
  for (const phrase of stopPhrases) {
    cleaned = cleaned.replace(phrase, '');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
};

const run = async () => {
  const message = "tenho que ir no show do ed sheeran hoje";
  const cleaned = cleanSearchQuery(message);
  const finalQuery = `${cleaned} data local horário`;
  console.log("Original Message:", message);
  console.log("Cleaned:", cleaned);
  console.log("Final Search Query:", finalQuery);

  try {
    const response = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(finalQuery)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const html = response.data;
    const rx = /<div class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    const matches = [];
    let match;
    while ((match = rx.exec(html)) !== null && matches.length < 5) {
      const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) matches.push(text);
    }
    console.log(`Found ${matches.length} snippets:`);
    matches.forEach((s, idx) => console.log(`${idx + 1}: ${s}`));
  } catch (error) {
    console.error("Search failed:", error.message);
  }
};

run();
