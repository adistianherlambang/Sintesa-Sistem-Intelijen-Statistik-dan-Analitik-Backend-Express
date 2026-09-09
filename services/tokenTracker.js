import LLMUsage from "../db/models/LLMUsage.js";

const KNOWN_MODELS = [
  {
    model: "gemini-1.5-flash",
    displayName: "Google Gemini 1.5 Flash",
    provider: "Google Gemini",
  },
  {
    model: "mistral-small-latest",
    displayName: "Mistral Small",
    provider: "Mistral AI",
  },
  {
    model: "@cf/google/gemma-7b-it-lora",
    displayName: "Cloudflare Gemma 7B",
    provider: "Cloudflare Workers AI",
  },
  {
    model: "@cf/google/gemma-2b-it-lora",
    displayName: "Cloudflare Gemma 2B",
    provider: "Cloudflare Workers AI",
  },
  {
    model: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
    displayName: "Cloudflare Mistral 7B",
    provider: "Cloudflare Workers AI",
  },
];

/**
 * Helper to resolve friendly model display name and provider
 */
export const getModelMetadata = (model = "") => {
  const m = model.toLowerCase();

  if (m.includes("gemini-1.5-flash")) {
    return { displayName: "Google Gemini 1.5 Flash", provider: "Google Gemini" };
  }
  if (m.includes("gemini-1.5-pro")) {
    return { displayName: "Google Gemini 1.5 Pro", provider: "Google Gemini" };
  }
  if (m.includes("gemini-2.0-flash")) {
    return { displayName: "Google Gemini 2.0 Flash", provider: "Google Gemini" };
  }
  if (m.includes("gemini")) {
    return { displayName: "Google Gemini", provider: "Google Gemini" };
  }
  if (m.includes("mistral-small")) {
    return { displayName: "Mistral Small (Latest)", provider: "Mistral AI" };
  }
  if (m.includes("mistral-7b") || m.includes("cf-mistral")) {
    return { displayName: "Cloudflare Mistral 7B", provider: "Cloudflare Workers AI" };
  }
  if (m.includes("gemma-7b")) {
    return { displayName: "Cloudflare Gemma 7B", provider: "Cloudflare Workers AI" };
  }
  if (m.includes("gemma-2b")) {
    return { displayName: "Cloudflare Gemma 2B", provider: "Cloudflare Workers AI" };
  }
  if (m.includes("cloudflare") || m.includes("@cf/")) {
    return { displayName: model, provider: "Cloudflare Workers AI" };
  }
  return { displayName: model, provider: "LLM Engine" };
};

/**
 * Estimate tokens if provider doesn't supply usage metadata
 * Rough standard: ~3.8 characters per token for multi-language text
 */
export const estimateTokens = (text) => {
  if (!text || typeof text !== "string") return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
};

/**
 * Record token usage in database
 */
export const recordTokenUsage = async ({
  model,
  provider,
  inputTokens = 0,
  outputTokens = 0,
  inputText = "",
  outputText = "",
}) => {
  try {
    const finalInputTokens =
      inputTokens > 0 ? Math.round(inputTokens) : estimateTokens(inputText);
    const finalOutputTokens =
      outputTokens > 0 ? Math.round(outputTokens) : estimateTokens(outputText);
    const finalTotalTokens = finalInputTokens + finalOutputTokens;

    const normalizedModel = model || "unknown-model";
    const meta = getModelMetadata(normalizedModel);

    await LLMUsage.findOneAndUpdate(
      { model: normalizedModel },
      {
        $inc: {
          inputTokens: finalInputTokens,
          outputTokens: finalOutputTokens,
          totalTokens: finalTotalTokens,
          totalRequests: 1,
        },
        $set: {
          provider: provider || meta.provider,
          displayName: meta.displayName,
          lastUsed: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.error("[TokenTracker] Gagal mencatat token usage:", err.message);
  }
};

/**
 * Retrieve aggregated and per-model LLM token stats
 */
export const getLLMTokenStats = async () => {
  try {
    const records = await LLMUsage.find().sort({ totalTokens: -1 }).lean();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalRequests = 0;

    const existingMap = new Map();

    records.forEach((r) => {
      totalInputTokens += r.inputTokens || 0;
      totalOutputTokens += r.outputTokens || 0;
      totalTokens += r.totalTokens || 0;
      totalRequests += r.totalRequests || 0;

      const meta = getModelMetadata(r.model);
      existingMap.set(r.model, {
        model: r.model,
        displayName: r.displayName || meta.displayName,
        provider: r.provider || meta.provider,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        totalTokens: r.totalTokens || 0,
        totalRequests: r.totalRequests || 0,
        lastUsed: r.lastUsed || null,
      });
    });

    // Also include default known models if not yet triggered so the UI has structure
    KNOWN_MODELS.forEach((km) => {
      if (!existingMap.has(km.model)) {
        existingMap.set(km.model, {
          model: km.model,
          displayName: km.displayName,
          provider: km.provider,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalRequests: 0,
          lastUsed: null,
        });
      }
    });

    const models = Array.from(existingMap.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens || b.totalRequests - a.totalRequests
    );

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalRequests,
      models,
    };
  } catch (err) {
    console.error("[TokenTracker] Gagal mengambil stats LLM:", err.message);
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalRequests: 0,
      models: KNOWN_MODELS.map((km) => ({
        ...km,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalRequests: 0,
        lastUsed: null,
      })),
    };
  }
};
