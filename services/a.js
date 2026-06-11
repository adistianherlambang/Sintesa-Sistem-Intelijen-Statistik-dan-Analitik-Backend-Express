import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memastikan mengarah tepat ke root folder c_be/.env
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const exportToJson = async () => {
  try {
    console.log("Env Path:", envPath);
    console.log("Mongo URL:", process.env.MONGO_URL);

    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL tidak ditemukan di .env");
    }

    await mongoose.connect(process.env.MONGO_URL);

    console.log("✔ Connected to MongoDB");

    const total = await APIDataBPS.countDocuments();

    console.log(`✔ Total documents: ${total}`);

    const data = await APIDataBPS.find({}).lean();

    const exportDir = path.join(__dirname, "../export");

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const exportFile = path.join(exportDir, "APIDataBPS.json");

    fs.writeFileSync(exportFile, JSON.stringify(data, null, 2), "utf8");

    console.log(`✔ Export completed`);
    console.log(`📂 File saved: ${exportFile}`);
  } catch (error) {
    console.error("✖ Error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("✔ MongoDB disconnected");
  }
};

exportToJson();
