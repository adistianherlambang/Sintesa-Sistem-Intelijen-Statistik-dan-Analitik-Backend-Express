import path from "path";
import dotenv from "dotenv";
import cloudscraper from "cloudscraper";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import APIDataBPS from "../db/models/APIDataBPS.js";

// --- INITIATION & CONFIG ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const URL =
  "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/th/123/key/6140cf4d3d3cc537fe36176ad6ad09d2/";

export const fetchBPSYoY3 = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL);
      console.log("✔ MongoDB connected");
    }

    console.log(`\nFetching BPS URL: ${URL}`);

    const responseText = await cloudscraper.get(URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        Referer: "https://bps.go.id/",
        Connection: "keep-alive",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      },
    });

    if (!responseText) {
      throw new Error("Empty response from BPS API");
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Invalid JSON response from BPS API");
    }

    console.log("RESPONSE STATUS :", data?.status || "-");
    console.log("AVAILABILITY    :", data?.["data-availability"] || "-");
    console.log("VAR VAL         :", data?.var?.[0]?.val || "-");

    const updated = await APIDataBPS.findOneAndUpdate(
      { "var.val": 1 },
      { $set: { yoy3: data.datacontent || {} } },
      { upsert: true, returnDocument: "after" }
    );

    if (updated) {
      console.log(
        "✔ yoy3 successfully saved/updated in MongoDB for var.val: 1"
      );
    } else {
      console.log("⚠ Document update failed");
    }
  } catch (err) {
    console.error("✖ Error fetching/saving BPS data:", err.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("✔ MongoDB connection closed\n");
    }
  }
};

// fetchBPSYoY3()