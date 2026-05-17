import e from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

//utils
import batchProcessor from "../../utils/batchProcessor.js";

//cache
import { KelCache } from "../../cache/overviewCache.js";

const router = e.Router();
const time = 5;

router.post("/inflasi", async (req, res) => {
  try {
    let response;

    for (let i = 0; i <= time; i++) {
      response = await axios.get(
        "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/vervar/1872/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/",
      );
      if (!response.ok) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      } else break;
    }

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: err.message + " (Gagal mengambil data inflasi)",
    });
  }
});

router.post("/ihk", async (req, res) => {
  try {
    let response;

    for (let i = 0; i <= time; i++) {
      response = await axios.get(
        "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2245/vervar/34/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/",
      );
      if (!response.ok) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      } else break;
    }

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: err.message + " (Gagal mengambil data IHK)",
    });
  }
});

router.post("/kelompok", async (req, res) => {
  try {
    const API_KEY = process.env.BPS_API_KEY;

    const kelompok = [
      {
        nama: "Makanan, Minuman dan Tembakau",
        var: 2223,
      },
      {
        nama: "Pakaian dan Alas Kaki",
        var: 2224,
      },
      {
        nama: "Perumahan, Air, Listrik dan Bahan Bakar Rumah Tangga",
        var: 2225,
      },
      {
        nama: "Perlengkapan, Peralatan dan Pemeliharaan Rutin Rumah Tangga",
        var: 2226,
      },
      {
        nama: "Kesehatan",
        var: 2227,
      },
      {
        nama: "Informasi, Komunikasi dan Jasa Keuangan",
        var: 2228,
      },
      {
        nama: "Transportasi",
        var: 2229,
      },
      {
        nama: "Rekreasi, Olahraga dan Budaya",
        var: 2230,
      },
      {
        nama: "Pendidikan",
        var: 2231,
      },
      {
        nama: "Penyediaan Makanan dan Minuman / Restoran",
        var: 2232,
      },
      {
        nama: "Perawatan Pribadi dan Jasa Lainnya",
        var: 2233,
      },
    ];

    const fetchKelompok = async (item) => {
      let response = null;
      for (let i = 0; i < 3; i++) {
        try {
          console.log(`REQUEST ${item.nama} | TRY ${i + 1}`);
          response = await axios.get(
            `https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/${item.var}/th/126/key/${API_KEY}/`,
            {
              timeout: 2000,
              headers: {
                "User-Agent": "Mozilla/5.0",
              },
            },
          );
          console.log(`SUCCESS ${item.nama}`);
          break;
        } catch (err) {
          console.log(`FAILED ${item.nama}`, err.message);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      if (!response) {
        console.log(`SKIP ${item.nama}`);
        return null;
      }
      const json = response.data;
      if (!json?.datacontent) {
        console.log(`DATACONTENT KOSONG ${item.nama}`);
        return null;
      }
      const dataContent = Object.values(json.datacontent);
      if (dataContent.length === 0) {
        console.log(`ARRAY KOSONG ${item.nama}`);
        return null;
      }
      const latest = dataContent.at(-1);

      return {
        kelompok: item.nama,

        latest,
      };
    };

    const hasil = await batchProcessor({
      data: kelompok,
      batchSize: 3,
      delay: 300,
      callback: fetchKelompok,
    });

    console.log(
      "HASIL BERHASIL",

      hasil,
    );

    if (hasil.length === 0) {
      return res.status(500).json({
        error: "Semua request gagal",
      });
    }

    const terbesar = hasil.reduce((prev, curr) =>
      curr.latest > prev.latest ? curr : prev,
    );

    res.json(terbesar);
  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: err.message + " (Gagal mengambil data kelompok inflasi)",
    });
  }
});

export default router;


// "34224501262": 108.8,
// "34224501263": 108.99,
// "34224501261": 108.28,
// "34224501264": 109.18,
// "122224501262": 109.7,
// "123224501261": 110.14,