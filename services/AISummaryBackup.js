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
import {
  getInflasiByKota,
  getInflasiYoyByKota,
  getInflasiYtdByKota,
} from "../controller/dashboard/inflasiController.js";
import { getIhkByKota } from "../controller/dashboard/ihkController.js";
import {
  getKomoditasByKota,
  getKomoditasYoyByKota,
  getKomoditasYtdByKota,
} from "../controller/dashboard/komoditasController.js";

//json
import kotaConfig from "../json/kota.json" with { type: "json" };

import APIDataBPS from "../db/models/APIDataBPS.js";
import AISummaryModel from "../db/models/AISummary.js";
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
    const year = date.getFullYear();

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

    console.log("\n==========================================================================");
    console.log("🚀 Memulai Pengambilan 7 Data Indikator & Pembuatan AI Summary per Wilayah");
    console.log("==========================================================================\n");

    const totalCities = kotaConfig.length;
    let cityCounter = 0;

    for (const city of kotaConfig) {
      cityCounter++;
      const namaKotaInflasi = city.inflasi ? city.inflasi.label : null;
      const namaKotaIhk = city.ihk_komoditas ? city.ihk_komoditas.label : null;

      const percent = Math.round((cityCounter / totalCities) * 100);
      const barLength = 20;
      const filledLength = Math.round((barLength * cityCounter) / totalCities);
      const progressBar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

      process.stdout.write(
        `\r⏳ [${String(cityCounter).padStart(3, " ")}/${totalCities}] [${progressBar}] ${percent}% | Process: ${city.name.padEnd(25)}`
      );

      try {
        let inflasiMoMVal = 0;
        let inflasiYoYVal = "N/A";
        let inflasiYtdVal = "N/A";

        if (namaKotaInflasi) {
          const [dataInflasiMoM, dataInflasiYoY, dataInflasiYtd] = await Promise.all([
            getInflasiByKota(namaKotaInflasi).catch(() => null),
            getInflasiYoyByKota(namaKotaInflasi).catch(() => null),
            getInflasiYtdByKota(namaKotaInflasi).catch(() => null),
          ]);

          inflasiMoMVal = dataInflasiMoM?.dashboard?.now ?? 0;
          inflasiYoYVal = dataInflasiYoY?.dashboard?.now ?? "N/A";
          inflasiYtdVal = dataInflasiYtd?.dashboard?.now ?? "N/A";
        }

        let ihkMomVal = 0;
        let komoditasMomLabel = "N/A";
        let komoditasYoyLabel = "N/A";
        let komoditasYtdLabel = "N/A";

        if (namaKotaIhk) {
          const [dataIhkMom, dataKomoditasMoM, dataKomoditasYoY, dataKomoditasYtd] = await Promise.all([
            getIhkByKota(namaKotaIhk).catch(() => null),
            getKomoditasByKota(namaKotaIhk).catch(() => null),
            getKomoditasYoyByKota(namaKotaIhk).catch(() => null),
            getKomoditasYtdByKota(namaKotaIhk).catch(() => null),
          ]);

          ihkMomVal = dataIhkMom?.dashboard?.now ?? 0;

          komoditasMomLabel = dataKomoditasMoM?.biggest
            ? `${dataKomoditasMoM.biggest.label} (${dataKomoditasMoM.biggest.value})`
            : "N/A";
          komoditasYoyLabel = dataKomoditasYoY?.biggest
            ? `${dataKomoditasYoY.biggest.label} (${dataKomoditasYoY.biggest.value})`
            : "N/A";
          komoditasYtdLabel = dataKomoditasYtd?.biggest
            ? `${dataKomoditasYtd.biggest.label} (${dataKomoditasYtd.biggest.value})`
            : "N/A";
        }

        inputData.push({
          kota: city.name,
          periode: `${bulan[month - 1] || "Juni"} ${year}`,
          ihkMom: ihkMomVal,
          inflasiMom: inflasiMoMVal,
          inflasiYoy: inflasiYoYVal,
          inflasiYtd: inflasiYtdVal,
          komoditasMom: komoditasMomLabel,
          komoditasYoy: komoditasYoyLabel,
          komoditasYtd: komoditasYtdLabel,
        });

        process.stdout.write(
          `\r✔ [${String(cityCounter).padStart(3, " ")}/${totalCities}] [${progressBar}] ${percent}% | Selesai data: ${city.name.padEnd(25)}\n`
        );
      } catch (err) {
        console.warn(
          `\n⚠ Melewati wilayah "${city.name}" karena error: ${err.message}`,
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
      `\n✔ Berhasil mengumpulkan data 7 Indikator Ekonomi untuk ${inputData.length} wilayah. Mengirim ke LLM...`,
    );

    const prompt = `
      Anda adalah analis ekonomi daerah profesional BPS.
      Berdasarkan data 7 indikator statistik BPS berikut, buat ringkasan narasi analisis ekonomi daerah untuk masing-masing wilayah dalam format JSON object dengan kunci "results".

      Data Wilayah:
      ${JSON.stringify(inputData, null, 2)}

      ATURAN PENULISAN RINGKASAN (SANGAT KETAT):
      1. KETENTUAN PANJANG KATA: Setiap ringkasan narasi "summary" HARUS MEMILIKI PANJANG TEPAT ANTARA 60 KATA SEHINGGA 70 KATA (MINIMAL 60 KATA, MAKSIMAL 70 KATA).
      2. Wajib mengulas dan menyebutkan 7 data indikator berikut dalam narasi:
         - IHK MoM (ihkMom)
         - Inflasi MoM (inflasiMom)
         - Inflasi YoY (inflasiYoy)
         - Inflasi YtD (inflasiYtd)
         - Komoditas MoM (komoditasMom)
         - Komoditas YoY (komoditasYoy)
         - Komoditas YtD (komoditasYtd)
      3. Gunakan Bahasa Indonesia formal, baku, profesional, dan informatif.
      4. Nilai properti "kota" pada JSON output HARUS SAMA PERSIS dengan nilai "kota" pada data input.

      Output HARUS berupa JSON object valid (tanpa wrapper markdown):
      {
        "results": [
          {
            "kota": "NAMA WILAYAH",
            "summary": "Teks ringkasan narasi analisis ekonomi daerah 60 sampai 70 kata..."
          }
        ]
      }
    `;

    let aiText = "";
    try {
      console.log("🤖 Mengirim prompt summary ke Mistral AI...");
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
      console.log("✔ Summary berhasil didapatkan dari Mistral AI.");
    } catch (mistralErr) {
      console.warn(
        "⚠ Gagal menggunakan Mistral AI, beralih ke Gemini sebagai fallback:",
        mistralErr.message,
      );
      try {
        console.log("🤖 Mengirim prompt summary ke Gemini...");
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
        console.log("✔ Summary berhasil didapatkan dari Gemini.");
      } catch (geminiErr) {
        console.error(
          "❌ Gagal total mendapatkan summary dari Mistral dan Gemini:",
          geminiErr.message,
        );
        throw geminiErr;
      }
    }

    const parsedResponse = JSON.parse(aiText);
    const allResults = Array.isArray(parsedResponse)
      ? parsedResponse
      : Array.isArray(parsedResponse.results)
        ? parsedResponse.results
        : Array.isArray(parsedResponse.data)
          ? parsedResponse.data
          : [];

    const getWordCount = (text) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

    console.log("\n=======================================================");
    console.log("📊 Hasil Pembuatan AI Summary & Verifikasi Jumlah Kata");
    console.log("=======================================================\n");

    let countIndex = 0;
    for (const result of allResults) {
      countIndex++;
      const words = getWordCount(result.summary);
      const statusIcon = words >= 60 && words <= 70 ? "✔" : "⚠️";
      console.log(
        `${statusIcon} [${String(countIndex).padStart(3, " ")}/${allResults.length}] Kota: ${result.kota.padEnd(25)} | Kata: ${String(words).padStart(2, " ")} | Summary: "${result.summary.slice(0, 50)}..."`
      );

      // Simpan/Upsert ke database MongoDB
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
    console.log("\n✔ Berhasil menyimpan seluruh summary ke database MongoDB.");

    // Menulis file airesult.json selevel dengan file ini setelah loop selesai
    const outputPath = path.join(__dirname, "airesult.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
    console.log(`✔ Berhasil menyimpan hasil ke ${outputPath}\n`);
  } catch (err) {
    console.error("❌ Terjadi error pada AISummary:", err.message);
  }
};

// AISummary();
