import axios from "axios";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv"

dotenv.config({
  path: path.resolve("../.env"),
});

//url
import { fileURLToPath } from "url";

// models
import APIDataBPS from "../db/models/APIDataBPS.js";

const MongooseURL = process.env.MONGO_URL
await mongoose.connect(MongooseURL)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(
  __dirname,
  "../json/fetchBPS.json"
);

const frames = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
];

let spinner;
let i = 0;

const startLoading = (text = "Loading") => {
  spinner = setInterval(() => {
    process.stdout.write(
      `\r${frames[i++ % frames.length]} ${text}`
    );
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
    const config = JSON.parse(
      fs.readFileSync(configPath, "utf-8")
    );

    const urls = config;

    console.log(`✔ Config loaded`);
    console.log(`Total URL: ${urls.length}\n`);

    const results = [];

    // LOOP URL
    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];

      let success = false;

      // RETRY 5x
      for (let retry = 1; retry <= 5; retry++) {
        try {
          startLoading(
            `Fetching ${index + 1}/${urls.length} | Retry ${retry}/5`
          );

          const res = await axios.get(url, {
            timeout: 15000,
          });

          stopLoading(
            `Success ${index + 1}/${urls.length}`
          );

          results.push(res.data);

          success = true;

          // BERHASIL -> lanjut URL berikutnya
          break;
        } catch (err) {
          clearInterval(spinner);

          process.stdout.write(
            `\r✖ Failed ${index + 1}/${urls.length} | Retry ${retry}/5 | ${err.message}\n`
          );

          // delay kecil sebelum retry
          await delay(2000);
        }
      }

      // kalau gagal semua retry
      if (!success) {
        console.log(
          `⚠ Skip URL ${index + 1}/${urls.length}\n`
        );
      }
    }

    console.log(
      `\n✔ Total success fetch: ${results.length}\n`
    );

    // SAVE MONGODB
    for (let index = 0; index < results.length; index++) {
      const data = results[index];

      const { last_update, ...rest } = data;

      try {
        startLoading(
          `Saving ${index + 1}/${results.length}`
        );

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

        stopLoading(
          `Saved ${index + 1}/${results.length}`
        );
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

    console.error(
      "\nFatal error:",
      err.message
    );
  }
};

fetchBPS();