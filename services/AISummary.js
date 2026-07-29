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

const toIndo = (val, decimals = 2) => {
  if (val === undefined || val === null || val === "" || val === "N/A") return "0,00";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  if (isNaN(num)) return "0,00";
  return num.toFixed(decimals).replace(".", ",");
};

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

    const bulanList = [
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
    const bulan = bulanList[month - 1] || "Juni";
    const tahun = String(year);

    console.log("\n==========================================================================");
    console.log("🚀 Memulai AISummary Generator (Template Literal Tanpa LLM - Hemat Token)");
    console.log("==========================================================================\n");

    const totalCities = kotaConfig.length;
    let cityCounter = 0;
    const allResults = [];

    for (const city of kotaConfig) {
      cityCounter++;
      const namaKotaInflasi = city.inflasi ? city.inflasi.label : null;
      const namaKotaIhk = city.ihk_komoditas ? city.ihk_komoditas.label : null;

      const percent = Math.round((cityCounter / totalCities) * 100);
      const barLength = 20;
      const filledLength = Math.round((barLength * cityCounter) / totalCities);
      const progressBar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

      try {
        let inflasi_mom = 0;
        let inflasi_yoy = 0;
        let inflasi_ytd = 0;

        if (namaKotaInflasi) {
          const [dataInflasiMoM, dataInflasiYoY, dataInflasiYtd] = await Promise.all([
            getInflasiByKota(namaKotaInflasi).catch(() => null),
            getInflasiYoyByKota(namaKotaInflasi).catch(() => null),
            getInflasiYtdByKota(namaKotaInflasi).catch(() => null),
          ]);

          inflasi_mom = dataInflasiMoM?.dashboard?.now ?? 0;
          inflasi_yoy = dataInflasiYoY?.dashboard?.now ?? 0;
          inflasi_ytd = dataInflasiYtd?.dashboard?.now ?? 0;
        }

        let ihk = 0;
        let compareIHK = 0;
        let komoditas_mom = "komoditas utama";
        let komoditas_mom_nilai = 0;
        let komoditas_yoy = "komoditas utama";
        let komoditas_yoy_nilai = 0;
        let komoditas_ytd = "komoditas utama";
        let komoditas_ytd_nilai = 0;

        if (namaKotaIhk) {
          const [dataIhkMom, dataKomoditasMoM, dataKomoditasYoY, dataKomoditasYtd] = await Promise.all([
            getIhkByKota(namaKotaIhk).catch(() => null),
            getKomoditasByKota(namaKotaIhk).catch(() => null),
            getKomoditasYoyByKota(namaKotaIhk).catch(() => null),
            getKomoditasYtdByKota(namaKotaIhk).catch(() => null),
          ]);

          ihk = dataIhkMom?.dashboard?.now ?? 0;
          compareIHK = dataIhkMom?.dashboard?.compare ?? 0;

          if (dataKomoditasMoM?.biggest) {
            komoditas_mom = dataKomoditasMoM.biggest.label || "komoditas utama";
            komoditas_mom_nilai = dataKomoditasMoM.biggest.value || 0;
          }
          if (dataKomoditasYoY?.biggest) {
            komoditas_yoy = dataKomoditasYoY.biggest.label || "komoditas utama";
            komoditas_yoy_nilai = dataKomoditasYoY.biggest.value || 0;
          }
          if (dataKomoditasYtd?.biggest) {
            komoditas_ytd = dataKomoditasYtd.biggest.label || "komoditas utama";
            komoditas_ytd_nilai = dataKomoditasYtd.biggest.value || 0;
          }
        }

        const ihk_trend = compareIHK >= 0 ? "naik" : "turun";
        const wilayah = city.name.replace(/^(KOTA|KABUPATEN|KAB)\s+/i, "");

        const numMom = typeof inflasi_mom === "number" ? inflasi_mom : parseFloat(String(inflasi_mom).replace(",", "."));

        const summaryText = `Pada ${bulan} ${tahun}, Kota ${wilayah} mencatat Indeks Harga Konsumen (IHK) sebesar ${toIndo(ihk)}, yang ${ihk_trend === "naik" ? "mengalami kenaikan" : "mengalami penurunan"} dibandingkan periode sebelumnya. Pada periode yang sama, inflasi bulanan (M to M) sebesar ${toIndo(inflasi_mom)}%, yang ${numMom > 0 ? "mengalami kenaikan" : numMom < 0 ? "mengalami penurunan" : "relatif stabil"} dibandingkan bulan sebelumnya. Secara tahunan, inflasi (Y on Y) tercatat sebesar ${toIndo(inflasi_yoy)}%, sedangkan inflasi tahun kalender (Y to D) mencapai ${toIndo(inflasi_ytd)}%. Inflasi M to M terutama dipengaruhi oleh komoditas ${komoditas_mom} yang mencatat inflasi sebesar ${toIndo(komoditas_mom_nilai)}%. Sementara itu, inflasi Y on Y terutama didorong oleh ${komoditas_yoy} dengan inflasi sebesar ${toIndo(komoditas_yoy_nilai)}%, sedangkan inflasi Y to D terutama dipengaruhi oleh ${komoditas_ytd} yang mencatat inflasi sebesar ${toIndo(komoditas_ytd_nilai)}%. Perkembangan tersebut mencerminkan dinamika harga barang dan jasa di Kota ${wilayah} selama ${bulan} ${tahun}, dengan tekanan inflasi yang berasal dari komoditas utama pada masing masing periode pengukuran serta perubahan Indeks Harga Konsumen yang menggambarkan kondisi harga konsumen secara umum.`;

        const wordCount = summaryText.trim().split(/\s+/).filter(Boolean).length;

        allResults.push({
          kota: city.name,
          summary: summaryText,
        });

        // Simpan/Upsert ke MongoDB
        await AISummaryModel.findOneAndUpdate(
          { kota: city.name },
          {
            kota: city.name,
            summary: summaryText,
            lastUpdate: lastUpdate,
          },
          { upsert: true, returnDocument: "after" },
        );

        process.stdout.write(
          `\r✔ [${String(cityCounter).padStart(3, " ")}/${totalCities}] [${progressBar}] ${percent}% | ${city.name.padEnd(25)} | (${wordCount} kata)\n`
        );
      } catch (err) {
        console.warn(
          `\n⚠ Error pada wilayah "${city.name}": ${err.message}`,
        );
      }
    }

    console.log("\n=======================================================");
    console.log(`✔ Selesai membuat & menyimpan AISummary untuk ${allResults.length} wilayah.`);
    console.log("=======================================================\n");

    // Menulis file airesult.json selevel dengan file ini setelah loop selesai
    const outputPath = path.join(__dirname, "airesult.json");
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
    console.log(`✔ Berhasil menyimpan hasil ke ${outputPath}\n`);
  } catch (err) {
    console.error("❌ Terjadi error pada AISummary:", err.message);
  }
};

// AISummary();
