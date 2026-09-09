import mongoose from "mongoose";

const LLMUsageSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    provider: {
      type: String,
      default: "unknown",
      trim: true,
    },
    displayName: {
      type: String,
      default: "",
      trim: true,
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    totalRequests: {
      type: Number,
      default: 0,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("LLMUsage", LLMUsageSchema);
