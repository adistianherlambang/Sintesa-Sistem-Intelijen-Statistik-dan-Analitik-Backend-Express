import mongoose from "mongoose";
import dotenv from "dotenv";
import ForecastResult from "../db/models/ForecastResult.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const results = await ForecastResult.find({});
  console.log(`\n=== Total ForecastResult Documents: ${results.length} ===`);

  // Find Kota Metro specifically
  const metro = results.find((r) => r.kota.toLowerCase().includes("metro"));
  if (metro) {
    console.log("\n=== Kota Metro Forecast Document ===");
    console.log(JSON.stringify(metro, null, 2));
  } else if (results.length > 0) {
    console.log("\n=== Sample Forecast Document ===");
    console.log(JSON.stringify(results[0], null, 2));
  }

  await mongoose.disconnect();
};

run().catch(console.error);
