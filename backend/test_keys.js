import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const keys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_BACKUP_1,
  process.env.GEMINI_API_KEY_BACKUP_2
];

console.log('Keys loaded from .env:');
keys.forEach((k, idx) => {
  console.log(`Key ${idx}: ${k ? k.substring(0, 10) + '...' : 'undefined'}`);
});

const testKey = async (key, name) => {
  if (!key) {
    console.log(`\n--- Test key ${name} ---\nSkipping (undefined)`);
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'responder apenas OK' }] }],
      generationConfig: { maxOutputTokens: 2 }
    });
    console.log(`\n--- Test key ${name} ---\nSuccess! Response: "${response.response.text().trim()}"`);
  } catch (err) {
    console.log(`\n--- Test key ${name} ---\nFailed! Error: "${err.message}"`);
  }
};

const run = async () => {
  await testKey(keys[0], 'Primary');
  await testKey(keys[1], 'Backup 1');
  await testKey(keys[2], 'Backup 2');
};

run();
