import mongoose from "mongoose";
import dotenv from "dotenv";
import e from "express";

//models
import APIDataBPS from "../../db/models/APIDataBPS.js";

//json
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };

const router = e.Router();

const date = new Date
const month = date.getMonth()
const year = "1" + String(date.getFullYear()).slice(2, 4)

const sort = (itemSorted) => {

  // jika array
  if (Array.isArray(itemSorted)) {
    return [...itemSorted].sort(
      (a, b) => Number(a.key) - Number(b.key)
    );
  }

  // jika object
  return Object.fromEntries(
    Object.entries(itemSorted).sort(
      (a, b) => Number(a[0]) - Number(b[0])
    )
  );
};

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
      "var.val": 2223
    })
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

    let hierarki = [];

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
      const sub = {};
      const data = {};
      const subData = {};

      for (const key in doc.datacontent) {

        // ambil turvar
        const turvar = key.slice(
          regionVal.length + 4,
          regionVal.length + 8
        );

        const keyYear = key.slice(
          regionVal.length + 8,
          regionVal.length + 11
        );

        const keyMonth = key.slice(
          regionVal.length + 11
        );

        // data utama
        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2" &&
          keyMonth === String(month) && 
          keyYear === String(year)
        ) {

          result.push({
            key,
            value: doc.datacontent[key],
            bulan: keyMonth
          });
        }
        
        for (const kelompok of varKelompokIHK) {

          if (key.startsWith(regionVal) &&
          turvar === String(kelompok.turvar) &&
          keyYear === String(year)) {

            data[key] = doc.datacontent[key];
            
          }

          for (const item of kelompok.sub) {

            if (key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            keyYear === String(year)) {

              if (!subData[item.val]) {
                subData[item.val] = {};
              }

              subData[item.val][key] = doc.datacontent[key];
            }
            
            if (key.startsWith(regionVal) && 
            turvar === String(item.val) &&
            keyYear === String(year) &&
            keyMonth === String(month)) {
              
              // overwrite data lama
              sub[item.val] = {
                label: item.label,
                value: doc.datacontent[key],
                bulan: Number(keyMonth),
                data: (subData)[item.val]
              };
            }
          }
        }
      }

      hierarki.push({
        label: varKelompokIHK[i].nama,
        value: sort(result)[0].value,
        bulan: Number(sort(result)[0].bulan),
        data: sort(data),
        sub: sub
      });

      biggest = [...hierarki].sort((a, b) => Number(a) - Number(b))[
        hierarki.length - 1
      ];
    }

    res.json({
      totalKomoditas: varKelompokIHK.length,
      hierarki,
      biggest,
    });
  } catch (err) {
    res.status(500).json({
      err: err.message,
    });
  }
});

router.post("/test", async (req, res) => {
  try {
    const doc = await APIDataBPS.findOne({
      "var.val": 2223
    });

    for (let i in varKelompokIHK) {

    }

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


// target json :

// {
//   hierarki: {
//     umum: {

//       for dari sini ambil dari var json di sub

//       kel1: {
//         data: 0.5,
//         label: "nama label",
//         sub: {
//           sub1: {
//             data: 5,
//             label: "nama label"
//           }
//         }
//       }
      
//     }
//   }
// }