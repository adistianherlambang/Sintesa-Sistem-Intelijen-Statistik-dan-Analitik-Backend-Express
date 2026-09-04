import express from "express";
import axios from "axios";
import { OpenAI } from "openai";

const router = express.Router();

/**
 * POST /api/llm/mistral
 * Endpoint untuk inferensi Mistral AI
 * Request Body: { "message": string, "model"?: string, "temperature"?: number, "systemPrompt"?: string }
 */
router.post("/mistral", async (req, res) => {
  try {
    const { message, prompt, model = "mistral-small-latest", temperature = 0.7, systemPrompt } = req.body;
    const inputMessage = message || prompt;
    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "MISTRAL_API_KEY belum dikonfigurasi di environment variables."
      });
    }

    if (!inputMessage) {
      return res.status(400).json({
        ok: false,
        error: "Field 'message' pada request body wajib diisi."
      });
    }

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.mistral.ai/v1"
    });

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: inputMessage });

    const completion = await client.chat.completions.create({
      model,
      temperature: Number(temperature),
      messages
    });

    const reply = completion.choices?.[0]?.message?.content || "";

    res.json({
      ok: true,
      llm: "mistral",
      model,
      message: reply,
      usage: completion.usage
    });
  } catch (error) {
    console.error("[LLM Mistral API Error]:", error.message);
    res.status(500).json({
      ok: false,
      error: error.response?.data?.message || error.message
    });
  }
});

/**
 * POST /api/llm/gemini
 * Endpoint untuk inferensi Google Gemini
 * Request Body: { "message": string, "model"?: string, "temperature"?: number, "systemPrompt"?: string }
 */
router.post("/gemini", async (req, res) => {
  try {
    const { message, prompt, model = "gemini-1.5-flash", temperature = 0.7, systemPrompt } = req.body;
    const inputMessage = message || prompt;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY belum dikonfigurasi di environment variables."
      });
    }

    if (!inputMessage) {
      return res.status(400).json({
        ok: false,
        error: "Field 'message' pada request body wajib diisi."
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [];
    if (systemPrompt) {
      contents.push({
        role: "user",
        parts: [{ text: `[System Instruction]: ${systemPrompt}` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Dimengerti, saya siap mengikuti instruksi tersebut." }]
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: inputMessage }]
    });

    const response = await axios.post(
      geminiUrl,
      {
        contents,
        generationConfig: {
          temperature: Number(temperature)
        }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 20000
      }
    );

    const candidates = response.data?.candidates;
    const reply = candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({
      ok: true,
      llm: "gemini",
      model,
      message: reply,
      usageMetadata: response.data?.usageMetadata
    });
  } catch (error) {
    console.error("[LLM Gemini API Error]:", error.message);
    res.status(500).json({
      ok: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

export default router;
