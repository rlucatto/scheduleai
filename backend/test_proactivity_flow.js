import { chatWithAssistant } from './services/gemini.js';

const run = async () => {
  const message = "tenho que ir no show do ed sheeran hoje";
  console.log(`Sending message to assistant: "${message}"`);
  try {
    const result = await chatWithAssistant(message, []);
    console.log("\n=== RESPONSE RESULT ===");
    console.log("Text:", result.text);
    console.log("Tool Calls:", JSON.stringify(result.toolCalls, null, 2));
    console.log("Model Used:", result.modelUsed);
  } catch (error) {
    console.error("Error in chatWithAssistant:", error);
  }
};

run();
