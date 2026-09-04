import { callUnifiedLLM } from "./api/llm/llmRoutes.js";
import dotenv from "dotenv";

dotenv.config();

console.log("Menguji inferensi LLM via llmRoutes...");
const response = await callUnifiedLLM({
  message: "halo! test llm via llmRoutes tulis 50 kata",
  provider: "auto",
});

console.log("\n[Hasil Balasan via llmRoutes - Model:", response.llm, "]:\n");
console.log(response.message || response.reply);

