import { checkSingleModelHealth } from './services/gemini.js';

const run = async () => {
  const model = 'gemini-2.5-flash';
  console.log(`Checking health of model: ${model}...`);
  try {
    const result = await checkSingleModelHealth(model);
    console.log("=== Health Check Result ===");
    console.log("Status:", result.status);
    console.log("Message:", result.message);
  } catch (error) {
    console.error("Error checking model health:", error);
  }
};

run();
