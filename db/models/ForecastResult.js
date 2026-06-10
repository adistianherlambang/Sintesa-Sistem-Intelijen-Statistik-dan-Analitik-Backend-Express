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
    forecast: {
      inflasi: [Number], // 3 elements array: [Month 18, Month 19, Month 20]
      ihk: [Number],     // 3 elements array: [Month 18, Month 19, Month 20]
      komoditas: mongoose.Schema.Types.Mixed, // Map: { "Commodity Name": [Month 18, Month 19, Month 20], ... }
    }
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("ForecastResult", ForecastResultSchema);
