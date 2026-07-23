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

const BASE_URL =
  "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2249/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/";
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

const buildUrlForYear = (url, yearCode) =>
  url.replace(/\/th\/[0-9]+(?=\/|$)/, `/th/1${yearCode}`);

const getYearPrevYoy = () => {
  const currentYear = new Date().getFullYear();
  return String(currentYear).slice(2, 4) - 1;
};

const getYearPrev2Yoy = () => {
  const currentYear = new Date().getFullYear();
  return String(currentYear).slice(2, 4) - 2;
};

const writeLog = async (text) => {
  await fs.appendFile(resultPath, text);
};

const fetchUrlData = async (url, label) => {
  for (let retry = 1; retry <= 5; retry++) {
    try {
      startLoading(`Fetching ${label} | Retry ${retry}/5`);

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

      await writeLog(`\nLINK : ${url}\nRESPONSE CONTENT:\n${responseText}\n\n`);

      if (!responseText) throw new Error("Empty response");

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid JSON response");
      }

      console.log(
        `\nLINK : ${url}\nRESPONSE STATUS : ${data?.status || "-"}\nAVAILABILITY : ${data?.["data-availability"] || "-"}\nVAR : ${data?.var?.[0]?.val || "-"}\n`,
      );

      stopLoading(`Success ${label}`);
      return data;
    } catch (err) {
      clearInterval(spinner);
      await writeLog(`\nERROR ON LINK: ${url}\nMESSAGE: ${err.message}\n\n`);
      console.log(`\n✖ Failed ${label} | Retry ${retry}/5 | ${err.message}`);

      if (retry < 5) await delay(2000);
    }
  }
  return null;
};

// --- MAIN EXPORT FUNCTION ---
export const fetchBPSPrevYear = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL);
      console.log("✔ MongoDB connected");
    }

    const yearPrevYoy = getYearPrevYoy();
    const yearPrev2Yoy = getYearPrev2Yoy();

    const urlPrevYoy = buildUrlForYear(BASE_URL, yearPrevYoy);
    const urlPrev2Yoy = buildUrlForYear(BASE_URL, yearPrev2Yoy);

    console.log("✔ Starting PrevYear fetch...");
    console.log(`URL prevYoy: ${urlPrevYoy}`);
    console.log(`URL prev2Yoy: ${urlPrev2Yoy}\n`);

    await fs.writeFile(resultPath, "");

    const dataPrevYoy = await fetchUrlData(urlPrevYoy, "prevYoy");
    const dataPrev2Yoy = await fetchUrlData(urlPrev2Yoy, "prev2Yoy");

    const updated = await APIDataBPS.findOneAndUpdate(
      { "var.val": 2249 },
      {
        $set: {
          prevYoy: dataPrevYoy?.datacontent || {},
          prev2Yoy: dataPrev2Yoy?.datacontent || {},
        },
      },
      { returnDocument: "after" },
    );

    if (updated) {
      console.log("✔ prevYoy and prev2Yoy updated for var.val 2249");
    } else {
      console.log("⚠ Document not found for var.val 2249");
    }

    console.log("\n✔ Finished fetch PrevYear");
  } catch (err) {
    clearInterval(spinner);
    console.error("\nFatal PrevYear error:", err.message);
  }
};

// fetchBPSPrevYear()
