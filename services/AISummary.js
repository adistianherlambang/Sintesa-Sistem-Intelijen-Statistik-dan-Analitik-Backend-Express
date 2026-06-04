import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs"; // Ditambahkan untuk menulis file
import { fileURLToPath } from "url"; // Ditambahkan untuk mendapatkan path file saat ini

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
import kota from "../json/kota.json" with {type: "json"}

import APIDataBPS from "../db/models/APIDataBPS.js";
import { type } from "os";
import { connectDB } from "../db/mongo.js";

export const AISummary = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

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

    for (const namaKota of kota) {
      try {
        const dataInflasi = await getInflasiByKota(namaKota);
        const inflasi = dataInflasi.dashboard.now;
        const compareMonthInflasi = dataInflasi.dashboard.compare;

        const inflasiYoYObj = dataInflasi.yoy.find((item) =>
          item.key.endsWith(`${yearYoy}${month}`)
        );
        const inflasiYoY = inflasiYoYObj ? inflasiYoYObj.value : "N/A";

        const dataIHK = await getIhkByKota(namaKota);
        const ihk = dataIHK.dashboard.now;
        const compareMonthIHK = dataIHK.dashboard.compare;

        const dataKomoditas = await getKomoditasByKota(namaKota);
        const namaKomoditas = dataKomoditas.biggest ? dataKomoditas.biggest.label : "N/A";
        const valueKomoditas = dataKomoditas.biggest ? dataKomoditas.biggest.value : 0;

        inputData.push({
          kota: namaKota,
          periode: `${bulan[month - 1]} ${year}`,
          IHK: ihk,
          compareIHK: compareMonthIHK,
          inflasiMoM: inflasi,
          compareInflasi: compareMonthInflasi,
          inflasiYoY: inflasiYoY,
          komoditasPendorongTerbesar: namaKomoditas,
          valueKomoditas: valueKomoditas,
        });
      } catch (err) {
        console.warn(`⚠ Melewati wilayah "${namaKota}" karena error: ${err.message}`);
      }
    }

    if (inputData.length === 0) {
      console.error("❌ Tidak ada data yang berhasil diambil untuk semua wilayah.");
      return;
    }

    console.log(`Berhasil mengambil data untuk ${inputData.length} wilayah. Mengirim ke Gemini...`);

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
      }
    );

    const aiText = res.data.candidates[0].content.parts[0].text;
    const allResults = JSON.parse(aiText);

    // Menulis file airesult.json selevel dengan file ini setelah loop selesai
    const outputPath = path.join(__dirname, "airesult.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
    console.log(`Berhasil menyimpan hasil ke ${outputPath}`);

  } catch (err) {
    console.error("❌ Terjadi error pada AISummary:", err.message);
  }
};

AISummary()