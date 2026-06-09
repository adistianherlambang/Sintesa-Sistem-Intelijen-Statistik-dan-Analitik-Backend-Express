import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const run = async () => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  console.log("Using API Key:", geminiApiKey ? `${geminiApiKey.slice(0, 5)}...` : "UNDEFINED");

  const prompt = "Hello, respond with 'Success' if you can read this.";
  
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        contents: [
          {
            parts: [
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 100,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": geminiApiKey,
        },
      }
    );

    const reply = res.data.candidates[0].content.parts[0].text;
    console.log("Gemini Response:", reply);
  } catch (err) {
    console.error("Error calling Gemini API:", err.response?.data || err.message);
  }
};

run();
