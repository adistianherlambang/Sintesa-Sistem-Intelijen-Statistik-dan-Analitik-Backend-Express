import fs from "fs/promises";
import fsSync from "fs";
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
const debugFolderPath = path.join(__dirname, "../debug_output/fetchPrev");
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

const buildYearUrl = (url, yearCode) =>
  url.replace(/\/th\/[0-9]+(?=\/|$)/, `/th/1${yearCode}`);

const getYearPrevYear = () => {
  const currentYear = new Date().getFullYear();
  return String(currentYear).slice(2, 4) - 1;
};

const getYearPrev2Year = () => {
  const currentYear = new Date().getFullYear();
  return String(currentYear).slice(2, 4) - 2;
};

const writeLog = async (text) => {
  await fs.appendFile(resultPath, text);
};

const getVarCode = (url, data) => {
  if (url) {
    const match = String(url).match(/\/var\/([^\/]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  if (data && data.var) {
    if (Array.isArray(data.var) && data.var[0] && data.var[0].val) {
      return data.var[0].val;
    } else if (data.var.val) {
      return data.var.val;
    }
  }
  return "unknown";
};

const saveDebugJSON = async (data, url, label = "") => {
  try {
    if (!data) return;
    if (!fsSync.existsSync(debugFolderPath)) {
      fsSync.mkdirSync(debugFolderPath, { recursive: true });
    }

    const varCode = getVarCode(url, data);
    const cleanFileName = String(varCode).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `${cleanFileName}.json`;
    const filePath = path.join(debugFolderPath, fileName);

    let contentToSave = data;
    const labelLower = String(label).toLowerCase();
    if (labelLower.includes("prev2year") || labelLower.includes("prevyear")) {
      const fieldKey = labelLower.includes("prev2year")
        ? "prev2Year"
        : "prevYear";
      let existing = {};
      if (fsSync.existsSync(filePath)) {
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          existing = JSON.parse(raw);
        } catch {
          existing = {};
        }
      }
      existing[fieldKey] = data;
      contentToSave = existing;
    }

    await fs.writeFile(filePath, JSON.stringify(contentToSave, null, 2), "utf-8");
    console.log(`📂 [DEBUG] Saved to ${filePath}`);
  } catch (error) {
    console.log(`✖ [DEBUG] Failed to save debug file: ${error.message}`);
  }
};

// --- CORE FETCH LOGIC FOR A SINGLE URL & YEAR ---
const fetchSingleUrl = async (url, label) => {
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

      if (
        data?.["data-availability"] &&
        data["data-availability"] !== "available"
      ) {
        clearInterval(spinner);
        console.log(
          `⚠ Data not available for ${url} (status: ${data["data-availability"]})`,
        );
        stopLoading(`Not available ${label}`);
        return null;
      }

      stopLoading(`Success ${label}`);
      await saveDebugJSON(data, url, label);
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
export const fetchBPSPrevMoM = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL);
      console.log("✔ MongoDB connected");
    }

    const bpsKey = process.env.API_BPS ? process.env.API_BPS.trim() : "";
    if (!bpsKey) {
      throw new Error("API_BPS tidak ditemukan di environment variables!");
    }
    const configFile = await fs.readFile(configPath, "utf-8");
    const rawConfig = JSON.parse(configFile);
    const rawUrls = Array.isArray(rawConfig)
      ? rawConfig.flatMap((item) =>
        typeof item === "string" ? item : item.content || [],
      )
      : [];
    const urls = rawUrls
      .filter((url) => typeof url === "string" && url.trim().length > 0)
      .map((url) => url.replaceAll("${API_BPS}", bpsKey));
    const yearPrevYear = getYearPrevYear();
    const yearPrev2Year = getYearPrev2Year();

    console.log("✔ PrevYear config loaded");
    console.log(`Total URLs to process: ${urls.length}\n`);

    await fs.writeFile(resultPath, "");

    for (let index = 0; index < urls.length; index++) {
      const baseUrl = urls[index];
      const humanIndex = index + 1;

      const urlPrevYear = buildYearUrl(baseUrl, yearPrevYear);
      const urlPrev2Year = buildYearUrl(baseUrl, yearPrev2Year);

      const dataPrevYear = await fetchSingleUrl(
        urlPrevYear,
        `PrevYear ${humanIndex}/${urls.length}`,
      );
      const dataPrev2Year = await fetchSingleUrl(
        urlPrev2Year,
        `Prev2Year ${humanIndex}/${urls.length}`,
      );

      const updateData = {};
      if (
        dataPrevYear?.["data-availability"] === "available" &&
        dataPrevYear?.datacontent
      ) {
        updateData.prevYear = dataPrevYear.datacontent;
      }
      if (
        dataPrev2Year?.["data-availability"] === "available" &&
        dataPrev2Year?.datacontent
      ) {
        updateData.prev2Year = dataPrev2Year.datacontent;
      }

      if (Object.keys(updateData).length === 0) {
        console.log(
          `⚠ Skip item ${humanIndex}/${urls.length}: Data prevYear & prev2Year tidak tersedia (not available)`,
        );
        continue;
      }

      const varVal =
        dataPrevYear?.var?.[0]?.val || dataPrev2Year?.var?.[0]?.val;

      if (varVal) {
        const updated = await APIDataBPS.findOneAndUpdate(
          { "var.val": varVal },
          {
            $set: updateData,
            $unset: {
              prevMom: "",
              prevMoM: "",
              prevYoy: "",
              prev2Yoy: "",
            },
          },
          { returnDocument: "after" },
        );

        if (updated) {
          console.log(`✔ prevYear & prev2Year updated for var.val ${varVal}`);
        } else {
          console.log(`⚠ Document not found for var.val ${varVal}`);
        }
      } else {
        console.log(`⚠ Skip item ${humanIndex}/${urls.length}: missing varVal`);
      }
    }

    console.log("\n✔ Finished fetch PrevYear & Prev2Year");
    console.log("✔ Result saved to result.txt\n");
  } catch (err) {
    clearInterval(spinner);
    console.error("\nFatal PrevYear error:", err.message);
  }
};

// fetchBPSPrevMoM()