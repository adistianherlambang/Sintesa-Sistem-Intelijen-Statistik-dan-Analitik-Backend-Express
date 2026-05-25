import fs from "fs/promises";
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

const configPath = path.join(__dirname, "../json/fetchBPS.json");
const resultPath = path.join(__dirname, "../result.txt");
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinner;
let spinnerIndex = 0;

// --- HELPER FUNCTIONS ---
const startLoading = (text = "Loading") => {
  spinner = setInterval(() => {
    process.stdout.write(`\r${FRAMES[spinnerIndex++ % FRAMES.length]} ${text}`);
  }, 80);
};

const stopLoading = (text = "Done") => {
  clearInterval(spinner);
  process.stdout.write(`\r✔ ${text}\n`);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildYoYUrl = (url, yearYoY) =>
  url.replace(/\/th\/[0-9]+(?=\/|$)/, `/th/1${yearYoY}`);

const getYearYoY = () => {
  const currentYear = new Date().getFullYear();
  return String(currentYear).slice(2, 4) - 1;
};

const writeLog = async (text) => {
  await fs.appendFile(resultPath, text);
};

// --- CORE FETCH LOGIC FOR SINGLE URL ---
const fetchSingleUrl = async (url, index, total) => {
  for (let retry = 1; retry <= 5; retry++) {
    try {
      startLoading(`Fetching YoY ${index}/${total} | Retry ${retry}/5`);

      const responseText = await cloudscraper.get(url, {
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

      // Mencatat log respon ke result.txt menggunakan pemisah \n
      await writeLog(`\nLINK : ${url}\nRESPONSE CONTENT:\n${responseText}\n\n`);

      if (!responseText) throw new Error("Empty response");

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid JSON response");
      }

      // Log ke konsol menggunakan pemisah \n
      console.log(
        `\nLINK : ${url}\nRESPONSE STATUS : ${data?.status || "-"}\nAVAILABILITY : ${data?.["data-availability"] || "-"}\nVAR : ${data?.var?.[0]?.val || "-"}\n`,
      );

      // Validasi ketersediaan data
      if (data["data-availability"] === "list-not-available") {
        stopLoading(`No YoY data ${index}/${total}`);
        console.log("⚠ BPS data not available");
        return true;
      }

      const varVal = data.var?.[0]?.val;
      if (!varVal) {
        stopLoading(`Invalid or missing var value ${index}/${total}`);
        console.log("⚠ Missing var.val");
        return true;
      }

      // Update Database
      const updated = await APIDataBPS.findOneAndUpdate(
        { "var.val": varVal },
        { $set: { yoy: data.datacontent || [] } },
        { new: true },
      );

      stopLoading(`Success YoY ${index}/${total}`);
      if (updated) {
        console.log(`✔ YoY updated for var.val ${varVal}`);
      } else {
        console.log(`⚠ Document not found for var.val ${varVal}`);
      }

      return true;
    } catch (err) {
      clearInterval(spinner);
      // Mencatat log error ke result.txt menggunakan pemisah \n
      await writeLog(`\nERROR ON LINK: ${url}\nMESSAGE: ${err.message}\n\n`);
      console.log(
        `\n✖ Failed YoY ${index}/${total} | Retry ${retry}/5 | ${err.message}`,
      );

      if (retry < 5) await delay(2000);
    }
  }
  return false;
};

// --- MAIN EXPORT FUNCTION ---
export const fetchBPSYoY = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL);
      console.log("✔ MongoDB connected");
    }

    const configFile = await fs.readFile(configPath, "utf-8");
    const urls = JSON.parse(configFile);
    const yearYoY = getYearYoY();
    const yoYUrls = urls.map((url) => buildYoYUrl(url, yearYoY));

    console.log("✔ YoY config loaded");
    console.log(`Total YoY URL: ${yoYUrls.length}\n`);

    await fs.writeFile(resultPath, "");

    for (let index = 0; index < yoYUrls.length; index++) {
      const url = yoYUrls[index];
      const humanIndex = index + 1;

      const isSuccess = await fetchSingleUrl(url, humanIndex, yoYUrls.length);

      if (!isSuccess) {
        console.log(`⚠ Skip YoY URL ${humanIndex}/${yoYUrls.length}`);
      }
    }

    console.log("\n✔ Finished fetch YoY");
    console.log("✔ Result saved to result.txt\n");
  } catch (err) {
    clearInterval(spinner);
    console.error("\nFatal YoY error:", err.message);
  }
};
