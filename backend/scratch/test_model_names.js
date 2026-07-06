import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const key = process.env.GEMINI_API_KEY;

const testModel = async (modelName) => {
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: modelName });
    const response = await model.generateContent('Olá! Responda apenas com a palavra OK.');
    console.log(`Model "${modelName}" - SUCCESS! Response: "${response.response.text().trim()}"`);
  } catch (err) {
    console.log(`Model "${modelName}" - FAILED! Error: "${err.message}"`);
  }
};

const run = async () => {
  console.log('Testing model names with Gemini API:');
  await testModel('gemini-2.5-flash');
  await testModel('gemini-2.0-flash');
  await testModel('gemini-1.5-flash');
};

run();
