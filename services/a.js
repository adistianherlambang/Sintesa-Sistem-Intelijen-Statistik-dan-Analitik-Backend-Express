import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";
import { connectDB } from "../db/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memastikan mengarah tepat ke root folder c_be/.env
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const exportToJson = async () => {
  try {
    await connectDB();

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
