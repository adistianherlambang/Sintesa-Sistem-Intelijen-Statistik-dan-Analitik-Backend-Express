import mongoose from "mongoose";
import dotenv from "dotenv";
import e from "express";

//models
import APIDataBPS from "../../db/models/APIDataBPS.js";

//json
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };

const router = e.Router();

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
    const inflasiVar = doc.var.find((item) => item.val === 1);

    // cari kota
    const region = doc.vervar.find((item) => item.label === kota);

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
        key.slice(regionVal.length, regionVal.length + 1) === "1"
      ) {
        result.push({
          key,
          value: doc.datacontent[key],
        });
      }
    }

    const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));
    const now = sorted[sorted.length - 1].value;
    const then = sorted[sorted.length - 2].value;
    const compare = now - then;

    res.json({
      kota,
      var: inflasiVar,
      regionVal,
      total: result.length,
      data: sorted,
      dashboard: {
        now: now,
        compare: Number(compare.toFixed(2)),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/inflasi", async (req, res) => {
  try {
    const doc = await APIDataBPS.findOne({
      "var.val": 1,
    });

    res.json({
      doc,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/ihk", async (req, res) => {
  try {
    const { kota } = req.body;

    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    // query hanya document yang punya var.val = 2245
    const doc = await APIDataBPS.findOne({
      "var.val": 2245,
    })
      .select("var vervar datacontent")
      .lean();

    if (!doc) {
      return res.status(404).json({
        message: "data inflasi tidak ditemukan",
      });
    }

    // ambil info var inflasi
    const inflasiVar = doc.var.find((item) => item.val === 2245);

    // cari kota
    const region = doc.vervar.find((item) => item.label === kota);

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
        key.slice(regionVal.length, regionVal.length + 1) === "2"
      ) {
        result.push({
          key,
          value: doc.datacontent[key],
        });
      }
    }

    const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));
    const now = sorted[sorted.length - 1].value;
    const then = sorted[sorted.length - 2].value;
    const compare = now - then;

    res.json({
      kota,
      var: inflasiVar,
      regionVal,
      total: result.length,
      data: sorted,
      dashboard: {
        now: now,
        compare: Number(compare.toFixed(2)),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/ihk", async (req, res) => {
  try {
    const doc = await APIDataBPS.findOne({
      "var.val": 2245,
    }).lean();

    res.json({
      doc,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/testapi", async (req, res) => {
  try {
    const response = await fetch(
      "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/",
    );
    if (!response.ok) {
      return res.status(response.status).json({
        message: "gagal",
      });
    }
    const data = await response.json();

    return res.json(data);
  } catch (err) {
    res.status(500).json({
      message: "server error",
    });
  }
});

router.get("/komoditas", async (req, res) => {
  try {
    const doc = await APIDataBPS.findOne({
      "var.val": 2233,
    });

    res.json(doc);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.post("/komoditas", async (req, res) => {
  try {
    const { kota } = req.body;

    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    let precentage = [];

    let totalKomoditas = 0;
    let biggest = 0;

    let val;

    for (const i in varKelompokIHK) {
      const doc = await APIDataBPS.findOne({
        "var.val": varKelompokIHK[i].var,
        "turvar.val": varKelompokIHK[i].turvar,
      })
        .select("var vervar datacontent")
        .lean();

      const region = doc.vervar.find((item) => item.label === kota);

      const regionVal = region.val.toString();

      // filter datacontent
      const result = [];

      for (const key in doc.datacontent) {
        // struktur:
        // (kode wilayah)(var)(turvar)(tahun)(bulan)

        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2"
        ) {
          val = doc.datacontent[key];

          result.push({
            key,
            value: val,
          });
        }
      }

      const sort = [...result].sort((a, b) => Number(a.key) - Number(b.key));

      precentage.push({
        nama: varKelompokIHK[i].nama,
        value: sort[0].value,
      });

      biggest = [...precentage].sort((a, b) => Number(a) - Number(b))[
        precentage.length - 1
      ];
    }

    res.json({
      precentage,
      totalKomoditas: varKelompokIHK.length,
      biggest,
    });
  } catch (err) {
    res.status(500).json({
      err: err.message,
    });
  }
});

router.post("/komoditas/post", async (req, res) => {
  try {
    const { vvv } = req.body;

    const doc = await APIDataBPS.findOne({
      "var.val": vvv,
    });

    res.json(doc);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const doc = await APIDataBPS.find().select("var");
    res.json({ doc });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;


// struktur api bps
//"34 2233 1601 126 2"