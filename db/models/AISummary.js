import mongoose from "mongoose";

const AISummarySchema = new mongoose.Schema(
  {
    lastUpdate: String,
    kota: String,
    summary: String,
  },
  { timestamps: true },
);

export default mongoose.model("AISummary", AISummarySchema);
