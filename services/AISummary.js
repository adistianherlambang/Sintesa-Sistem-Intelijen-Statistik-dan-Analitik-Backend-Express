import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs"; // Ditambahkan untuk menulis file
import { fileURLToPath } from "url"; // Ditambahkan untuk mendapatkan path file saat ini
import { OpenAI } from "openai";

// Mendapatkan direktori dari file saat ini untuk memastikan airesult.json selevel
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

//controller
import { getInflasiByKota } from "../controller/dashboard/inflasiController.js";
import { getIhkByKota } from "../controller/dashboard/ihkController.js";
import { getKomoditasByKota } from "../controller/dashboard/komoditasController.js";

//json
import kotaConfig from "../json/kota.json" with { type: "json" };

import APIDataBPS from "../db/models/APIDataBPS.js";
import AISummaryModel from "../db/models/AISummary.js";
import { type } from "os";
import { connectDB } from "../db/mongo.js";

export const AISummary = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    // Ambil data BPS terbaru untuk menentukan lastUpdate
    const latestDoc = await APIDataBPS.findOne()
      .sort({ lastUpdate: -1 })
      .select("lastUpdate")
      .lean();

    const lastUpdate =
      latestDoc && latestDoc.lastUpdate
        ? new Date(latestDoc.lastUpdate).toISOString()
        : new Date().toISOString();

    const date = new Date();
    const month = Number(date.getMonth()) - 1;
    const previousMonth = Number(month) - 1;
    const year = date.getFullYear();
    const previousYear = Number(year) - 1;

    const yearYoy = `1${String(year).slice(-2)}`;

    const bulan = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];

    // Array penampung data input untuk dikirim ke LLM
    const inputData = [];

    console.log("Mengambil data untuk semua wilayah...");

    for (const city of kotaConfig) {
      const namaKotaInflasi = city.inflasi ? city.inflasi.label : null;
      const namaKotaIhk = city.ihk_komoditas ? city.ihk_komoditas.label : null;

      try {
        let inflasi = 0;
        let compareMonthInflasi = 0;
        let inflasiYoY = "N/A";

        if (namaKotaInflasi) {
          const dataInflasi = await getInflasiByKota(namaKotaInflasi);
          inflasi = dataInflasi.dashboard.now;
          compareMonthInflasi = dataInflasi.dashboard.compare;

          const inflasiYoYObj = dataInflasi.yoy.find((item) =>
            item.key.endsWith(`${yearYoy}${month}`),
          );
          inflasiYoY = inflasiYoYObj ? inflasiYoYObj.value : "N/A";
        }

        let ihk = 0;
        let compareMonthIHK = 0;

        if (namaKotaIhk) {
          const dataIHK = await getIhkByKota(namaKotaIhk);
          ihk = dataIHK.dashboard.now;
          compareMonthIHK = dataIHK.dashboard.compare;
        }

        let namaKomoditas = "N/A";
        let valueKomoditas = 0;

        if (namaKotaIhk) {
          const dataKomoditas = await getKomoditasByKota(namaKotaIhk);
          namaKomoditas = dataKomoditas.biggest
            ? dataKomoditas.biggest.label
            : "N/A";
          valueKomoditas = dataKomoditas.biggest
            ? dataKomoditas.biggest.value
            : 0;
        }

        inputData.push({
          kota: city.name,
          periode: `${bulan[month - 1]} ${year}`,
          IHK: namaKotaIhk ? ihk : "N/A",
          compareIHK: namaKotaIhk ? compareMonthIHK : 0,
          inflasiMoM: namaKotaInflasi ? inflasi : 0,
          compareInflasi: namaKotaInflasi ? compareMonthInflasi : 0,
          inflasiYoY: inflasiYoY,
          komoditasPendorongTerbesar: namaKomoditas,
          valueKomoditas: valueKomoditas,
        });
      } catch (err) {
        console.warn(
          `⚠ Melewati wilayah "${city.name}" karena error: ${err.message}`,
        );
      }
    }

    if (inputData.length === 0) {
      console.error(
        "❌ Tidak ada data yang berhasil diambil untuk semua wilayah.",
      );
      return;
    }

    console.log(
      `Berhasil mengambil data untuk ${inputData.length} wilayah. Mengirim ke Gemini...`,
    );

    const prompt = `
      Anda adalah analis ekonomi daerah.
      Berdasarkan data IHK dan inflasi berikut, buat ringkasan kondisi ekonomi daerah untuk masing-masing wilayah dalam format JSON array.

      Data Wilayah:
      ${JSON.stringify(inputData, null, 2)}

      Aturan summary untuk masing-masing wilayah:
      - Maksimal 300 karakter termasuk spasi.
      - Hanya 1 kalimat.
      - Sebutkan IHK dan inflasi YoY (jika "N/A" sebutkan data YoY tidak tersedia).
      - Sebutkan faktor utama pendorong inflasi.
      - Jangan menambahkan data yang tidak diberikan.
      - Nilai properti "kota" pada JSON output harus sama persis dengan nilai "kota" pada data input (misal "KAB ACEH TENGAH" tetap "KAB ACEH TENGAH", jangan diubah).

      Output HARUS berupa JSON array valid dengan format:
      [
        {
          "kota": "NAMA WILAYAH",
          "summary": "Summary ringkasan kondisi ekonomi daerah..."
        }
      ]
    `;

    let aiText = "";
    try {
      console.log("Mengirim prompt summary ke Mistral...");
      const client = new OpenAI({
        apiKey:
          process.env.MISTRAL_API_KEY || "OCPWoSOISDgB3I19HovoNoqCJhKHMlLh",
        baseURL: "https://api.mistral.ai/v1",
      });
      const response = await client.chat.completions.create({
        model: "mistral-small-latest",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });
      aiText = response.choices[0].message.content;
      console.log("Summary berhasil didapatkan dari Mistral.");
    } catch (mistralErr) {
      console.warn(
        "⚠ Gagal menggunakan Mistral, beralih ke Gemini sebagai fallback:",
        mistralErr.message,
      );
      try {
        console.log("Mengirim prompt summary ke Gemini...");
        const res = await axios.post(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
          {
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": process.env.GEMINI_API_KEY,
            },
          },
        );
        aiText = res.data.candidates[0].content.parts[0].text;
        console.log("Summary berhasil didapatkan dari Gemini.");
      } catch (geminiErr) {
        console.error(
          "❌ Gagal total mendapatkan summary dari Mistral dan Gemini:",
          geminiErr.message,
        );
        throw geminiErr;
      }
    }

    const allResults = JSON.parse(aiText);

    // Simpan/Upsert ke database MongoDB
    console.log("Menyimpan summary ke database MongoDB...");
    for (const result of allResults) {
      await AISummaryModel.findOneAndUpdate(
        { kota: result.kota },
        {
          kota: result.kota,
          summary: result.summary,
          lastUpdate: lastUpdate,
        },
        { upsert: true, returnDocument: "after" },
      );
    }
    console.log("Berhasil menyimpan summary ke database.");

    // Menulis file airesult.json selevel dengan file ini setelah loop selesai
    const outputPath = path.join(__dirname, "airesult.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
    console.log(`Berhasil menyimpan hasil ke ${outputPath}`);
  } catch (err) {
    console.error("❌ Terjadi error pada AISummary:", err.message);
  }
};

AISummary();
