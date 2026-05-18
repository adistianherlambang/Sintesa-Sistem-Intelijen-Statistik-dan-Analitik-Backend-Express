import mongoose from "mongoose";
import dotenv from "dotenv"
import e from "express";

//models
import APIDataBPS from "../../db/models/APIDataBPS.js";

const router = e.Router()

router.post("/inflasi", async (req, res) => {
  try {
    const { kota } = req.body;

    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    // query hanya document yang punya var.val = 1
    const doc = await APIDataBPS.findOne({
      "var.val": 1,
    })
      .select("var vervar datacontent")
      .lean();

    if (!doc) {
      return res.status(404).json({
        message: "data inflasi tidak ditemukan",
      });
    }

    // ambil info var inflasi
    const inflasiVar = doc.var.find(
      (item) => item.val === 1
    );

    // cari kota
    const region = doc.vervar.find(
      (item) => item.label === kota
    );

    if (!region) {
      return res.status(404).json({
        message: "kota tidak ditemukan",
      });
    }

    const regionVal = region.val.toString();

    // filter datacontent
    const result = [];

    for (const key in doc.datacontent) {
      // struktur:
      // (kode wilayah)(var)(turvar)(tahun)(bulan)

      if (
        key.startsWith(regionVal) &&
        key.slice(
          regionVal.length,
          regionVal.length + 1
        ) === "1"
      ) {
        result.push({
          key,
          value: doc.datacontent[key],
        });
      }
    }

    res.json({
      kota,
      var: inflasiVar,
      regionVal,
      total: result.length,
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/inflasi/ambilsemua", async (req, res) => {
  try {
    const doc = await APIDataBPS.findOne({
      "var.val": 1
    }).select("vervar").lean()

    res.json({
      doc
    })
  } catch(err) {
    res.status(500).json({
      error: err.message
    })
  }
})

export default router