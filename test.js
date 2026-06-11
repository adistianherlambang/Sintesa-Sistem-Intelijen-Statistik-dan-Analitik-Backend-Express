import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: "OCPWoSOISDgB3I19HovoNoqCJhKHMlLh",
  baseURL: "https://api.mistral.ai/v1",
});

const response = await client.chat.completions.create({
  model: "mistral-small-latest",
  messages: [
    {
      role: "user",
      content: "halo! test mistral tulis 200 kata",
    },
  ],
});

console.log(response.choices[0].message.content);
