import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cloudscraper from "cloudscraper";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

const MONGO_URL = process.env.MONGO_URL;
await mongoose.connect(MONGO_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "../json/fetchBPS.json");

const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

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

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const fetchBPS = async () => {
  try {
    const urls = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    console.log("✔ Config loaded");
    console.log(`Total URL: ${urls.length}\n`);

    const results = [];

    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];

      let success = false;

      for (let retry = 1; retry <= 5; retry++) {
        try {
          startLoading(
            `Fetching ${index + 1}/${urls.length} | Retry ${retry}/5`
          );

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

          if (!responseText) {
            throw new Error("Empty response");
          }

          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error("Invalid JSON response");
          }

          if (!data) {
            throw new Error("Empty response");
          }

          console.log(`\n=== FETCH ${index + 1} SUCCESS ===`);
          console.log(JSON.stringify(data, null, 2));

          stopLoading(
            `Success ${index + 1}/${urls.length}`
          );

          results.push(data);

          success = true;
          break;
        } catch (err) {
          clearInterval(spinner);

          console.log(
            `\n✖ Failed ${index + 1}/${urls.length} | Retry ${retry}/5 | ${err.message}`
          );

          await delay(2000);
        }
      }

      if (!success) {
        console.log(`⚠ Skip URL ${index + 1}/${urls.length}`);
      }
    }

    console.log(`\n✔ Total success fetch: ${results.length}\n`);

    for (let index = 0; index < results.length; index++) {
      const data = results[index];

      if (!data) {
        console.log(`Skip empty data index ${index}`);
        continue;
      }

      console.log(`\n=== SAVE ${index + 1} ===`);
      console.log(JSON.stringify(data, null, 2));

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
            new: true,
          }
        );

        stopLoading(`Saved ${index + 1}/${results.length}`);
      } catch (err) {
        clearInterval(spinner);

        console.log(
          `✖ Save failed ${index + 1}/${results.length}`
        );

        console.log(err.message);
      }
    }

    console.log("\n✔ All process completed");
  } catch (err) {
    clearInterval(spinner);
    console.error("\nFatal error:", err.message);
  }
};

fetchBPS();