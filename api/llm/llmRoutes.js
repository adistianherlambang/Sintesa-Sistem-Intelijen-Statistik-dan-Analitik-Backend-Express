import express from "express";
import axios from "axios";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const router = express.Router();

/**
 * 1. INFERENCE MISTRAL AI
 */
export const callMistral = async ({
  message,
  prompt,
  model = "mistral-small-latest",
  temperature = 0.7,
  systemPrompt,
}) => {
  const inputMessage = message || prompt;
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY belum dikonfigurasi di environment variables.",
    );
  }

  if (!inputMessage) {
    throw new Error("Parameter 'message' (atau 'prompt') wajib diisi.");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.mistral.ai/v1",
  });

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: inputMessage });

  const completion = await client.chat.completions.create({
    model,
    temperature: Number(temperature),
    messages,
  });

  const reply = completion.choices?.[0]?.message?.content || "";

  return {
    ok: true,
    llm: "mistral",
    model,
    message: reply,
    reply,
    usage: completion.usage,
  };
};

/**
 * 2. INFERENCE GOOGLE GEMINI
 */
export const callGemini = async ({
  message,
  prompt,
  model = "gemini-1.5-flash",
  temperature = 0.7,
  systemPrompt,
  responseMimeType,
}) => {
  const inputMessage = message || prompt;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di environment variables.",
    );
  }

  if (!inputMessage) {
    throw new Error("Parameter 'message' (atau 'prompt') wajib diisi.");
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [];
  if (systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `[System Instruction]: ${systemPrompt}` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Dimengerti, saya siap mengikuti instruksi tersebut." }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: inputMessage }],
  });

  const generationConfig = {
    temperature: Number(temperature),
  };
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  const response = await axios.post(
    geminiUrl,
    {
      contents,
      generationConfig,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 25000,
    },
  );

  const candidates = response.data?.candidates;
  const reply = candidates?.[0]?.content?.parts?.[0]?.text || "";

  return {
    ok: true,
    llm: "gemini",
    model,
    message: reply,
    reply,
    usageMetadata: response.data?.usageMetadata,
  };
};

/**
 * 3. INFERENCE CLOUDFLARE WORKERS AI (GOOGLE GEMMA)
 */
export const callGemma = async ({
  message,
  prompt,
  model = "@cf/google/gemma-7b-it-lora",
  systemPrompt = "You are a friendly assistant",
}) => {
  const inputMessage = message || prompt;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID atau CLOUDFLARE_API_TOKEN / CLOUDFLARE_AUTH_TOKEN belum dikonfigurasi di environment variables.",
    );
  }

  if (!inputMessage) {
    throw new Error("Parameter 'message' (atau 'prompt') wajib diisi.");
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: inputMessage });

  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const response = await axios.post(
    cfUrl,
    { messages },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const rawResult = response.data?.result;
  const reply =
    typeof rawResult === "string"
      ? rawResult
      : rawResult?.response || JSON.stringify(rawResult);

  let llmName = "cloudflare-ai";
  if (model.includes("mistral")) llmName = "cloudflare-mistral-7b";
  else if (model.includes("2b")) llmName = "cloudflare-gemma-2b";
  else if (model.includes("7b")) llmName = "cloudflare-gemma-7b";

  return {
    ok: true,
    llm: llmName,
    model,
    message: reply,
    reply,
    raw: response.data,
  };
};

export const callCloudflareAI = callGemma;

/**
 * 4. UNIFIED LLM INFERENCE (Dengan Otomatis Fallback Antar Model)
 * Urutan: Gemini -> Mistral -> Cloudflare Mistral 7B -> Cloudflare Gemma 7B -> Cloudflare Gemma 2B
 */
export const callUnifiedLLM = async ({
  message,
  prompt,
  provider = "auto",
  model,
  temperature = 0.7,
  systemPrompt,
  responseMimeType,
}) => {
  const inputMessage = message || prompt;
  if (!inputMessage) {
    throw new Error("Parameter 'message' (atau 'prompt') wajib diisi.");
  }

  // Jika spesifik provider dipilih:
  if (provider === "mistral") {
    return await callMistral({ message: inputMessage, model, temperature, systemPrompt });
  }
  if (provider === "cf-mistral" || provider === "mistral-7b") {
    return await callGemma({
      message: inputMessage,
      model: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
      systemPrompt,
    });
  }
  if (provider === "gemini") {
    return await callGemini({ message: inputMessage, model, temperature, systemPrompt, responseMimeType });
  }
  if (provider === "gemma" || provider === "cloudflare" || provider === "gemma-7b") {
    return await callGemma({ message: inputMessage, model: model || "@cf/google/gemma-7b-it-lora", systemPrompt });
  }
  if (provider === "gemma-2b") {
    return await callGemma({ message: inputMessage, model: model || "@cf/google/gemma-2b-it-lora", systemPrompt });
  }

  // Jika provider === "auto": urutan prioritas: Gemini -> Mistral -> Cloudflare Mistral 7B -> Cloudflare Gemma 7B -> Cloudflare Gemma 2B
  const errors = [];

  // 1. Coba Gemini terlebih dahulu
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini({ message: inputMessage, model, temperature, systemPrompt, responseMimeType });
    } catch (err) {
      console.warn("[UnifiedLLM] Gemini gagal, mencoba Mistral:", err.message);
      errors.push(`Gemini: ${err.message}`);
    }
  }

  // 2. Coba Mistral API
  if (process.env.MISTRAL_API_KEY && !responseMimeType) {
    try {
      return await callMistral({ message: inputMessage, model, temperature, systemPrompt });
    } catch (err) {
      console.warn("[UnifiedLLM] Mistral gagal, mencoba Cloudflare Mistral 7B:", err.message);
      errors.push(`Mistral: ${err.message}`);
    }
  }

  const cfToken =
    process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN;

  // 3. Coba Cloudflare Mistral 7B (setelah Mistral)
  if (process.env.CLOUDFLARE_ACCOUNT_ID && cfToken && !responseMimeType) {
    try {
      return await callGemma({
        message: inputMessage,
        model: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
        systemPrompt,
      });
    } catch (err) {
      console.warn("[UnifiedLLM] Cloudflare Mistral 7B gagal, mencoba Gemma 7B:", err.message);
      errors.push(`CF-Mistral-7B: ${err.message}`);
    }
  }

  // 4. Coba Cloudflare Gemma 7B
  if (process.env.CLOUDFLARE_ACCOUNT_ID && cfToken && !responseMimeType) {
    try {
      return await callGemma({
        message: inputMessage,
        model: model || "@cf/google/gemma-7b-it-lora",
        systemPrompt,
      });
    } catch (err) {
      console.warn("[UnifiedLLM] Cloudflare Gemma 7B gagal, mencoba Gemma 2B:", err.message);
      errors.push(`Gemma-7B: ${err.message}`);
    }
  }

  // 5. Opsi Terakhir: Cloudflare Gemma 2B
  if (process.env.CLOUDFLARE_ACCOUNT_ID && cfToken && !responseMimeType) {
    try {
      return await callGemma({
        message: inputMessage,
        model: "@cf/google/gemma-2b-it-lora",
        systemPrompt,
      });
    } catch (err) {
      console.warn("[UnifiedLLM] Cloudflare Gemma 2B gagal:", err.message);
      errors.push(`Gemma-2B: ${err.message}`);
    }
  }

  throw new Error(`Semua provider LLM gagal atau belum terkonfigurasi. Error: ${errors.join(" | ")}`);
};

// ==========================================
// ROUTER HTTP HANDLERS
// ==========================================

/**
 * POST /api/llm/mistral
 */
router.post("/mistral", async (req, res) => {
  try {
    const result = await callMistral(req.body);
    res.json(result);
  } catch (error) {
    console.error("[LLM Mistral API Error]:", error);
    const status = error.status || error.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: error.error?.message || error.response?.data?.message || error.message,
      details: error.response?.data || error.error || null,
    });
  }
});

/**
 * POST /api/llm/gemini
 */
router.post("/gemini", async (req, res) => {
  try {
    const result = await callGemini(req.body);
    res.json(result);
  } catch (error) {
    console.error("[LLM Gemini API Error]:", error);
    const status = error.response?.status || 500;
    res.status(status).json({
      ok: false,
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

/**
 * POST /api/llm/gemma, /api/llm/gemma-7b, /api/llm/gemma-2b, /api/llm/cf-mistral, /api/llm/mistral-7b, /api/llm/cloudflare
 */
const handleCloudflareRoute = async (req, res, defaultModel) => {
  try {
    const payload = defaultModel ? { model: defaultModel, ...req.body } : req.body;
    const result = await callGemma(payload);
    res.json(result);
  } catch (error) {
    console.error("[LLM Cloudflare Error]:", error);
    const status = error.response?.status || 500;
    res.status(status).json({
      ok: false,
      error:
        error.response?.data?.errors?.[0]?.message ||
        error.response?.data?.message ||
        error.message,
    });
  }
};

router.post("/gemma", (req, res) => handleCloudflareRoute(req, res));
router.post("/cloudflare", (req, res) => handleCloudflareRoute(req, res));
router.post("/gemma-7b", (req, res) => handleCloudflareRoute(req, res, "@cf/google/gemma-7b-it-lora"));
router.post("/gemma-2b", (req, res) => handleCloudflareRoute(req, res, "@cf/google/gemma-2b-it-lora"));
router.post("/cf-mistral", (req, res) => handleCloudflareRoute(req, res, "@cf/mistral/mistral-7b-instruct-v0.2-lora"));
router.post("/mistral-7b", (req, res) => handleCloudflareRoute(req, res, "@cf/mistral/mistral-7b-instruct-v0.2-lora"));

/**
 * POST /api/llm/generate & POST /api/llm/
 * Endpoint cerdas: otomatis memilih provider aktif dengan fallback
 */
const handleUnifiedRoute = async (req, res) => {
  try {
    const result = await callUnifiedLLM(req.body);
    res.json(result);
  } catch (error) {
    console.error("[LLM Unified Route Error]:", error);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};

router.post("/generate", handleUnifiedRoute);
router.post("/", handleUnifiedRoute);

export default router;
