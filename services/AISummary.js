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

    const date = new Date()
    const month = Number(date.getMonth()) - 1
    const previousMonth = Number(month) - 1
    const year = date.getFullYear()
    const previousYear = Number(year) - 1

    const yearYoy = `1${String(year).slice(-2)}`;

    const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

    // Array penampung hasil untuk disimpan ke JSON
    const allResults = [];

    for (const namaKota of kota) {
      const dataInflasi = await getInflasiByKota(namaKota);
      const inflasi = dataInflasi.dashboard.now;
      const compareMonthInflasi = dataInflasi.dashboard.compare;

      const inflasiYoY = dataInflasi.yoy.find((item) => 
        item.key.endsWith(`${yearYoy}${month}`)
      );

      const dataIHK = await getIhkByKota(namaKota);
      const ihk = dataIHK.dashboard.now;
      const compareMonthIHK = dataIHK.dashboard.compare;

      const dataKomoditas = await getKomoditasByKota(namaKota);
      const namaKomoditas = dataKomoditas.biggest.label;
      const valueKomoditas = dataKomoditas.biggest.value;

      const res = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
        {
          contents: [
            {
              parts: [
                {
                  text: `
                    Anda adalah analis ekonomi daerah.

                    Berdasarkan data IHK dan inflasi berikut, buat ringkasan kondisi ekonomi daerah.

                    Data:
                    - Wilayah: ${namaKota}
                    - Periode: ${bulan[month - 1]} ${year}
                    - IHK: ${ihk}
                    - IHK bulan sebelumnya: ${compareMonthIHK}
                    - Inflasi MoM: ${inflasi}%
                    - Inflasi bulan sebelumnya: ${compareMonthInflasi}
                    - Inflasi YoY: ${inflasiYoY}%
                    - komoditas pendorong inflasi terbesar: ${namaKomoditas}
                    - value komoditas pendorong inflasi: ${valueKomoditas}

                    Aturan:
                    - Maksimal 300 karakter termasuk spasi.
                    - Hanya 1 kalimat.
                    - Sebutkan IHK dan inflasi YoY.
                    - Sebutkan faktor utama pendorong inflasi.
                    - Jangan menambahkan data yang tidak diberikan.
                  `,
                },
              ],
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": process.env.GEMINI_API_KEY,
          },
        },
      );

      const aiText = res.data.candidates[0].content.parts[0].text;
      console.log(aiText);

      // Memasukkan data ke array penampung hanya dengan properti kota dan summary
      allResults.push({
        kota: key,
        summary: aiText.trim()
      });

    }
    
    // Menulis file airesult.json selevel dengan file ini setelah loop selesai
    const outputPath = path.join(__dirname, "airesult.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
    console.log(`Berhasil menyimpan hasil ke ${outputPath}`);

  } catch (err) {
    console.error(err.message);
  }
};

AISummary()