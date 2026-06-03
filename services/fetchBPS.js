import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cloudscraper from "cloudscraper";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";
import { connectDB } from "../db/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Kunci jalur .env secara absolut ke folder root (satu tingkat di atas folder services)
const rootEnvPath = path.join(__dirname, "..", ".env");
dotenv.config({
  path: rootEnvPath,
});

const configPath = path.join(__dirname, "../json/fetchBPS.json");
const debugFolderPath = path.join(__dirname, "../debug_output");

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

// Fungsi untuk menyimpan file JSON hasil debug per link secara lokal
const saveDebugJSON = (data, index) => {
  try {
    if (!fs.existsSync(debugFolderPath)) {
      fs.mkdirSync(debugFolderPath, { recursive: true });
    }

    let fileNameVal = "unknown";
    if (data && data.var) {
      if (Array.isArray(data.var) && data.var[0] && data.var[0].val) {
        fileNameVal = data.var[0].val;
      } else if (data.var.val) {
        fileNameVal = data.var.val;
      }
    }

    const cleanFileName = String(fileNameVal).replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `${index + 1}_${cleanFileName}.json`;
    const filePath = path.join(debugFolderPath, fileName);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`\n📂 [DEBUG] Saved to ${filePath}`);
  } catch (error) {
    console.log(`\n✖ [DEBUG] Failed to save debug file: ${error.message}`);
  }
};

export const fetchBPS = async () => {
  try {
    // 1. Validasi Environment dan Koneksi MongoDB
    // Terima baik `MONGO_URL` maupun `MONGO_URI` agar kompatibel dengan .env lama/baru
    const mongoURI = process.env.MONGO_URL || process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error(`MONGO_URL tidak ditemukan! Pastikan file .env ada di: ${rootEnvPath}`);
    }

    console.log("⏳ Connecting to MongoDB...");
    await connectDB();
    console.log("🚀 Connected to MongoDB successfully\n");

    // 2. Load Configuration URLs
    if (!fs.existsSync(configPath)) {
      throw new Error(`File config fetchBPS.json tidak ditemukan di: ${configPath}`);
    }
    const urls = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    console.log("✔ Config loaded");
    console.log(`Total URL: ${urls.length}\n`);

    const results = [];

    // 3. Proses Fetching Data via Cloudscraper
    for (let index = 0; index < urls.length; index++) {
      const url = urls[index];
      let success = false;

      for (let retry = 1; retry <= 5; retry++) {
        try {
          startLoading(
            `Fetching ${index + 1}/${urls.length} | Retry ${retry}/5`,
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
          console.log(`Status API BPS: ${data.status || "OK"}`); 

          stopLoading(`Success ${index + 1}/${urls.length}`);

          // Simpan log file JSON lokal untuk debugging
          saveDebugJSON(data, index);
          results.push(data);

          success = true;
          break;
        } catch (err) {
          clearInterval(spinner);
          console.log(
            `\n✖ Failed ${index + 1}/${urls.length} | Retry ${retry}/5 | ${err.message}`,
          );
          await delay(2000);
        }
      }

      if (!success) {
        console.log(`⚠ Skip URL ${index + 1}/${urls.length}`);
      }
    }

    console.log(`\n✔ Total success fetch: ${results.length}\n`);

    // 4. Proses Simpan / Update ke MongoDB
    for (let index = 0; index < results.length; index++) {
      const data = results[index];

      if (!data) {
        console.log(`Skip empty data index ${index}`);
        continue;
      }

      console.log(`\n=== SAVE TO DB ${index + 1} ===`);

      // Ekstrak var[0].val secara aman untuk filter pencarian data lama
      let varVal = null;
      if (data && data.var && Array.isArray(data.var) && data.var[0]) {
        varVal = data.var[0].val;
      }

      if (!varVal) {
        console.log(`⚠ Skip indeks ke-${index + 1}: Struktur 'var.val' tidak valid atau kosong.`);
        continue;
      }

      const { last_update, ...rest } = data;

      try {
        startLoading(`Saving ${index + 1}/${results.length} (ID Var: ${varVal})`);

        // Cari dokumen lama berdasarkan kesamaan 'var.val'
        await APIDataBPS.findOneAndUpdate(
          {
            "var.val": varVal 
          },
          {
            ...rest,
            lastUpdate: new Date(last_update),
          },
          {
            upsert: true,            // Buat data baru jika var.val belum ada di DB
            returnDocument: 'after', // Menghilangkan Mongoose warning
          }
        );

        stopLoading(`Saved ${index + 1}/${results.length} (ID Var: ${varVal})`);
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
    // 5. Tutup koneksi database setelah perulangan selesai
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("🔌 Database connection closed safely.");
    }
  }
};

// Eksekusi otomatis
fetchBPS();