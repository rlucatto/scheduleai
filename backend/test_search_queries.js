import { searchWeb } from './services/gemini.js';

const run = async () => {
  const query1 = "tenho que ir no show do ed sheeran hoje data local horário endereço";
  const query2 = "show do ed sheeran hoje";
  const query3 = "show ed sheeran brasil";
  
  console.log("=== QUERY 1 ===");
  console.log("Searching:", query1);
  const res1 = await searchWeb(query1);
  console.log("Res 1 length:", res1.length);
  console.log(res1.slice(0, 500));

  console.log("\n=== QUERY 2 ===");
  console.log("Searching:", query2);
  const res2 = await searchWeb(query2);
  console.log("Res 2 length:", res2.length);
  console.log(res2.slice(0, 500));

  console.log("\n=== QUERY 3 ===");
  console.log("Searching:", query3);
  const res3 = await searchWeb(query3);
  console.log("Res 3 length:", res3.length);
  console.log(res3.slice(0, 500));
};

run();
