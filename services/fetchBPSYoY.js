import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cloudscraper from "cloudscraper";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
});

await mongoose.connect(process.env.MONGO_URL);

console.log("✔ MongoDB connected");

const configPath = path.join(
  __dirname,
  "../json/fetchBPS.json"
);

const resultPath = path.join(
  __dirname,
  "../result.txt"
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
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

const buildYoYUrl = (url, yearYoY) => {
  return url.replace(
    /\/th\/[0-9]+(?=\/|$)/,
    `/th/1${yearYoY}`
  );
};

const getYearYoY = () => {
  const date = new Date();

  return (
    String(date.getFullYear()).slice(2, 4) - 1
  );
};

export const fetchBPSYoY = async () => {
  try {
    const urls = JSON.parse(
      fs.readFileSync(
        configPath,
        "utf-8"
      )
    );

    const yearYoY = getYearYoY();

    const yoYUrls = urls.map((url) =>
      buildYoYUrl(url, yearYoY)
    );

    console.log("✔ YoY config loaded");

    console.log(
      `Total YoY URL: ${yoYUrls.length}\n`
    );

    fs.writeFileSync(resultPath, "");

    for (
      let index = 0;
      index < yoYUrls.length;
      index++
    ) {
      const url = yoYUrls[index];

      let success = false;

      for (
        let retry = 1;
        retry <= 5;
        retry++
      ) {
        try {
          startLoading(
            `Fetching YoY ${index + 1}/${yoYUrls.length} | Retry ${retry}/5`
          );

          const responseText =
            await cloudscraper.get(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",

                Accept:
                  "application/json, text/plain, */*",

                "Accept-Language":
                  "id-ID,id;q=0.9,en-US;q=0.8",

                Referer:
                  "https://bps.go.id/",

                Connection:
                  "keep-alive",

                "Sec-Fetch-Site":
                  "same-site",

                "Sec-Fetch-Mode":
                  "cors",

                "Sec-Fetch-Dest":
                  "empty",
              },
            });

          fs.appendFileSync(
            resultPath,
            `
====================================
LINK : ${url}
====================================

${responseText}


`
          );

          if (!responseText) {
            throw new Error(
              "Empty response"
            );
          }

          let data;

          try {
            data =
              JSON.parse(responseText);
          } catch {
            throw new Error(
              "Invalid JSON response"
            );
          }

          console.log(`
====================================
link : ${url}
response : ${data?.status || "-"}
availability : ${
            data?.[
              "data-availability"
            ] || "-"
          }
var : ${
            data?.var?.[0]?.val || "-"
          }
====================================
`);

          if (
            data[
              "data-availability"
            ] ===
            "list-not-available"
          ) {
            stopLoading(
              `No YoY data ${index + 1}/${yoYUrls.length}`
            );

            console.log(
              "⚠ BPS data not available"
            );

            success = true;

            break;
          }

          if (
            !Array.isArray(data.var) ||
            data.var.length === 0
          ) {
            stopLoading(
              `Invalid var ${index + 1}/${yoYUrls.length}`
            );

            console.log(
              "⚠ Empty var"
            );

            success = true;

            break;
          }

          const varVal =
            data.var[0]?.val;

          if (!varVal) {
            stopLoading(
              `Invalid var value ${index + 1}/${yoYUrls.length}`
            );

            console.log(
              "⚠ Missing var.val"
            );

            success = true;

            break;
          }

          const updated =
            await APIDataBPS.findOneAndUpdate(
              {
                "var.val":
                  varVal,
              },
              {
                $set: {
                  yoy:
                    data.datacontent ||
                    [],
                },
              },
              {
                new: true,
              }
            );

          stopLoading(
            `Success YoY ${index + 1}/${yoYUrls.length}`
          );

          if (updated) {
            console.log(
              `✔ YoY updated for var.val ${varVal}`
            );
          } else {
            console.log(
              `⚠ Document not found for var.val ${varVal}`
            );
          }

          success = true;

          break;
        } catch (err) {
          clearInterval(spinner);

          fs.appendFileSync(
            resultPath,
            `
====================================
ERROR
====================================

${err.message}


`
          );

          console.log(
            `\n✖ Failed YoY ${index + 1}/${yoYUrls.length} | Retry ${retry}/5 | ${err.message}`
          );
          await delay(2000);
        }

      }

      if (!success) {
        console.log(
          `⚠ Skip YoY URL ${index + 1}/${yoYUrls.length}`
        );
      }
    }

    console.log(
      "\n✔ Finished fetch YoY"
    );

    console.log(
      "✔ Result saved to result.txt\n"
    );
  } catch (err) {
    clearInterval(spinner);

    console.error(
      "\nFatal YoY error:",
      err.message
    );
  }
};