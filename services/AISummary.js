import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

//controller
import { getInflasiByKota } from "../controller/dashboard/inflasiController.js";

dotenv.config();

import APIDataBPS from "../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

export const AISummary = async () => {
  try {

    const date = new Date()
    const month = date.getMonth()
    const 
    const year = date.getFullYear()

    const dataInflasi = await getInflasiByKota({kota: "KOTA METRO"})

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
                  - Wilayah: {{wilayah}}
                  - Periode: {{periode}}
                  - IHK: {{ihk}}
                  - Inflasi MtM: {{inflasi_mtm}}%
                  - Inflasi YtD: {{inflasi_ytd}}%
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
  } catch (err) {
    console.error(err.message);
  }
};
