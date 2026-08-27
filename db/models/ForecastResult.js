import mongoose from "mongoose";

const ForecastResultSchema = new mongoose.Schema(
  {
    kota: {
      type: String,
      required: true,
      unique: true, // Only one active forecast per city
    },
    regionVal_ihk: String,
    regionVal_inflasi: String,
    forecast: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("ForecastResult", ForecastResultSchema);
