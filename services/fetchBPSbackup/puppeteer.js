import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import puppeteer from "puppeteer-core";

// url
import { fileURLToPath } from "url";

// models
import APIDataBPS from "../../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

// =======================
// MONGODB
// =======================

const MongooseURL = process.env.MONGO_URL;

await mongoose.connect(MongooseURL);

console.log("✔ MongoDB connected");

// =======================
// PATH
// =======================

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "../json/fetchBPS.json");

// =======================
// CHROME PATH MACOS
// =======================

const chromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// =======================
// LOADING
// =======================

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinner;

let i = 0;

const startLoading = (text = "Loading") => {
  spinner = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${text}`);
  }, 80);
};

const stopLoading = (text = "Done") => {
  clearInterval(spinner);

  process.stdout.write(`\r✔ ${text}\n`);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =======================
// FETCH FUNCTION
// =======================

export const fetchBPS = async () => {
  let browser;

  try {
    // =======================
    // READ CONFIG
    // =======================

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const urls = config;

    console.log("✔ Config loaded");

    console.log(`Total URL: ${urls.length}\n`);

    // =======================
    // OPEN BROWSER
    // =======================

    browser = await puppeteer.launch({
      executablePath: chromePath,

      headless: false,

      defaultViewport: null,

      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    );

    await page.setExtraHTTPHeaders({
      Accept: "application/json, text/plain, */*",

      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
    });

    const results = [];

    // =======================
    // LOOP URL
    // =======================

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];

      let success = false;

      // =======================
      // RETRY 5X
      // =======================

      for (let retry = 1; retry <= 5; retry++) {
        try {
          startLoading(
            `Fetching ${index + 1}/${urls.length} | Retry ${retry}/5`,
          );

          const response = await page.goto(url, {
            waitUntil: "networkidle2",

            timeout: 60000,
          });

          if (!response) {
            throw new Error("No response");
          }

          const status = response.status();

          if (status !== 200) {
            throw new Error(`HTTP ${status}`);
          }

          // =======================
          // RAW TEXT
          // =======================

          const text = await response.text();

          if (!text || text.length < 10) {
            throw new Error("Empty response");
          }

          // =======================
          // SAVE DEBUG
          // =======================

          fs.writeFileSync(
            path.join(__dirname, `debug-${index + 1}.txt`),
            text,
          );

          // =======================
          // VALIDASI HTML / ERROR
          // =======================

          if (
            text.includes("<html") ||
            text.includes("Internal Server Error") ||
            text.includes("Cloudflare") ||
            text.includes("blocked")
          ) {
            throw new Error("Invalid API response");
          }

          // =======================
          // PARSE JSON
          // =======================

          let data;

          try {
            data = JSON.parse(text);
          } catch {
            throw new Error("Invalid JSON");
          }

          stopLoading(`Success ${index + 1}/${urls.length}`);

          results.push(response.data);

          success = true;

          // delay antar request
          await delay(7000);

          break;
        } catch (err) {
          clearInterval(spinner);

          process.stdout.write(
            `\r✖ Failed ${index + 1}/${urls.length} | Retry ${retry}/5 | ${err.message}\n`,
          );

          await delay(3000);
        }
      }

      // =======================
      // SKIP
      // =======================

      if (!success) {
        console.log(`⚠ Skip URL ${index + 1}/${urls.length}\n`);
      }
    }

    console.log(`\n✔ Total success fetch: ${results.length}\n`);

    // =======================
    // SAVE MONGODB
    // =======================

    for (let index = 0; index < results.length; index++) {
      const data = results[index];

      const { last_update, ...rest } = data;

      try {
        startLoading(`Saving ${index + 1}/${results.length}`);

        await APIDataBPS.findOneAndUpdate(
          {
            status: data.status,

            lastUpdate: new Date(last_update),
          },
          {
            ...rest,

            lastUpdate: new Date(last_update),
          },
          {
            upsert: true,

            returnDocument: "after",
          },
        );

        stopLoading(`Saved ${index + 1}/${results.length}`);
      } catch (err) {
        clearInterval(spinner);

        console.log(`✖ Save failed ${index + 1}/${results.length}`);

        console.log(err.message);
      }
    }

    console.log("\n✔ All process completed");
  } catch (err) {
    clearInterval(spinner);

    console.error("\nFatal error:", err.message);
  } finally {
    if (browser) {
      await browser.close();
    }

    await mongoose.disconnect();

    console.log("✔ MongoDB disconnected");
  }
};

fetchBPS();
