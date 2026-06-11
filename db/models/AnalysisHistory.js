import mongoose from "mongoose";

const AnalysisHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    periode: {
      type: String,
      required: true,
    },
    analysisFile: {
      type: String, // Filename or identifier of the IDML file saved in filesystem
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export default mongoose.model("AnalysisHistory", AnalysisHistorySchema);
