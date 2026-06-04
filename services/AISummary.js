import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

//controller
import { getInflasiByKota } from "../controller/dashboard/inflasiController.js";
import { getIhkByKota } from "../controller/dashboard/ihkController.js";
import { getKomoditasByKota } from "../controller/dashboard/komoditasController.js";

//json
import kota from "../json/kota.json" with {type: "json"}

dotenv.config();

import APIDataBPS from "../db/models/APIDataBPS.js";
import { type } from "os";

dotenv.config({
  path: path.resolve("../.env"),
});

export const AISummary = async () => {
  try {

    const date = new Date()
    const month = Number(date.getMonth()) - 1
    const previousMonth = Number(month) - 1
    const year = date.getFullYear()
    const previousYear = Number(year) - 1

    const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

    for(const key in kota) {

      const dataInflasi = await getInflasiByKota({kota: key})
      const inflasi = dataInflasi.dashboard.now
      const compareMonthInflasi = dataInflasi.dashboard.compare

      const dataIHK = await getIhkByKota({kota: key})
      const ihk = dataIHK.dashboard.now
      const compareMonthIHK = dataIHK.dashboard.compare

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
                    - Wilayah: ${kota}
                    - Periode: ${bulan[month - 1]} ${year}
                    - IHK: ${ihk}
                    - IHK bulan sebelumnya: ${compareMonthIHK}
                    - Inflasi MoM: ${inflasi}%
                    - Inflasi bulan sebelumnya: ${compareMonthInflasi}
                    - Inflasi YoY: {{inflasi_yoy}}%
                    - Pendorong inflasi: {{pendorong}}
                    - Penahan inflasi: {{penahan}}

                    Aturan:
                    - Maksimal 300 karakter termasuk spasi.
                    - Hanya 1 kalimat.
                    - Sebutkan IHK dan inflasi YoY.
                    - Sebutkan faktor utama pendorong inflasi.
                    - Sebutkan faktor penahan inflasi jika tersedia.
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

      console.log(res.data.candidates[0].content.parts[0].text);

    }
  } catch (err) {
    console.error(err.message);
  }
};

AISummary()