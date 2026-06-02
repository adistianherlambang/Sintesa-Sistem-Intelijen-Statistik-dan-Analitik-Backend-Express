import mongoose from "mongoose";
import dotenv from "dotenv";
import e from "express";

//models
import APIDataBPS from "../../db/models/APIDataBPS.js";

//json
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };

const router = e.Router();

const date = new Date();
const month = String(date.getMonth() - 1)
const year = "1" + String(date.getFullYear()).slice(2, 4);
const yoy = year - 1;

const sort = (itemSorted) => {
  // jika array
  if (Array.isArray(itemSorted)) {
    return [...itemSorted].sort((a, b) => Number(a.key) - Number(b.key));
  }

  // jika object
  return Object.fromEntries(
    Object.entries(itemSorted).sort((a, b) => Number(a[0]) - Number(b[0])),
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

    // Query document dengan var.val = 2245, pastikan select field 'yoy' juga
    const doc = await APIDataBPS.findOne({
      "var.val": 2245,
    })
      .select("var vervar datacontent yoy")
      .lean();

    if (!doc) {
      return res.status(404).json({
        message: "data inflasi tidak ditemukan",
      });
    }

    // Ambil info var inflasi
    const inflasiVar = doc.var.find((item) => item.val === 2245);

    // Cari kota
    const region = doc.vervar.find((item) => item.label === kota);

    if (!region) {
      return res.status(404).json({
        message: "kota tidak ditemukan",
      });
    }

    const regionVal = region.val.toString();

    // ==========================================
    // A. FILTER DATACONTENT (UNTUK DATA & DASHBOARD)
    // ==========================================
    const result = [];

    for (const key in doc.datacontent) {
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
    
    // Ambil nilai untuk dashboard secara aman
    const now = sorted.length > 0 ? sorted[sorted.length - 1].value : 0;
    const then = sorted.length > 1 ? sorted[sorted.length - 2].value : 0;
    const compare = now - then;

    // ==========================================
    // B. FILTER DOC.YOY (UNTUK RESPONSE YOY)
    // ==========================================
    const resultYoy = [];

    if (doc.yoy) {
      for (const key in doc.yoy) {
        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2"
        ) {
          resultYoy.push({
            key,
            value: doc.yoy[key],
          });
        }
      }
    }

    // Urutkan data YoY sama persis logikanya dengan data reguler
    const sortedYoy = [...resultYoy].sort((a, b) => Number(a.key) - Number(b.key));

    // Kirim response dengan susunan yang kamu minta
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
      yoy: sortedYoy, // Menampilkan array data YoY tepat di bawah dashboard
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
      "var.val": 2223,
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

    // Validasi input body
    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    let hierarki = [];
    let yoyList = []; // Array baru untuk menampung hierarki data YoY di root level
    let biggest = null;

    // Loop data berdasarkan kelompok IHK
    for (const i in varKelompokIHK) {
      const doc = await APIDataBPS.findOne({
        "var.val": varKelompokIHK[i].var,
        "turvar.val": varKelompokIHK[i].turvar,
      })
        .select("var vervar datacontent yoy")
        .lean();

      // PROTEKSI 1: Lewati jika dokumen dari BPS tidak ditemukan
      if (!doc || !doc.vervar) continue;

      // PROTEKSI 2: Cari region/kota, lewati kelompok ini jika tidak ditemukan
      const region = doc.vervar.find((item) => item.label === kota);
      if (!region) continue;

      const regionVal = region.val.toString();

      // ==========================================
      // A. PROSES DATA UTAMA (HIERARKI / DATACONTENT)
      // ==========================================
      const result = [];
      const sub = {};
      const data = {};
      const subData = {};

      for (const key in doc.datacontent) {
        const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
        const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
        const keyMonth = key.slice(regionVal.length + 11);

        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2" &&
          Number(keyMonth) === Number(month) &&
          Number(keyYear) === Number(year)
        ) {
          result.push({
            key,
            value: doc.datacontent[key],
            bulan: keyMonth,
          });
        }

        for (const kelompok of varKelompokIHK) {
          if (key.startsWith(regionVal) && turvar === String(kelompok.turvar) && Number(keyYear) === Number(year)) {
            data[key] = doc.datacontent[key];
          }

          for (const item of kelompok.sub) {
            if (key.startsWith(regionVal) && turvar === String(item.val) && Number(keyYear) === Number(year)) {
              if (!subData[item.val]) subData[item.val] = {};
              subData[item.val][key] = doc.datacontent[key];
            }

            if (key.startsWith(regionVal) && turvar === String(item.val) && Number(keyYear) === Number(year) && Number(keyMonth) === Number(month)) {
              sub[item.val] = {
                label: item.label,
                value: doc.datacontent[key],
                bulan: Number(keyMonth),
                data: sort(subData)[item.val],
              };
            }
          }
        }
      }

      const sortedResult = sort(result);
      const mainData = sortedResult && sortedResult.length > 0 ? sortedResult[0] : null;

      hierarki.push({
        label: varKelompokIHK[i].nama,
        value: mainData ? mainData.value : 0,
        bulan: mainData ? Number(mainData.bulan) : Number(month),
        data: sort(data),
        sub: sub,
      });

      // ==========================================
      // B. PROSES DATA YOY (SAMA PERSIS LOGIKANYA)
      // ==========================================
      if (doc.yoy) {
        const resultYoy = [];
        const subYoy = {};
        const dataYoy = {};
        const subDataYoy = {};

        for (const key in doc.yoy) {
          const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
          const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
          const keyMonth = key.slice(regionVal.length + 11);

          if (
            key.startsWith(regionVal) &&
            key.slice(regionVal.length, regionVal.length + 1) === "2" &&
            Number(keyMonth) === Number(month) &&
            Number(keyYear) === Number(yoy) // Menggunakan tahun YoY (-1)
          ) {
            resultYoy.push({
              key,
              value: doc.yoy[key],
              bulan: keyMonth,
            });
          }

          for (const kelompok of varKelompokIHK) {
            if (key.startsWith(regionVal) && turvar === String(kelompok.turvar) && Number(keyYear) === Number(yoy)) {
              dataYoy[key] = doc.yoy[key];
            }

            for (const item of kelompok.sub) {
              if (key.startsWith(regionVal) && turvar === String(item.val) && Number(keyYear) === Number(yoy)) {
                if (!subDataYoy[item.val]) subDataYoy[item.val] = {};
                subDataYoy[item.val][key] = doc.yoy[key];
              }

              if (key.startsWith(regionVal) && turvar === String(item.val) && Number(keyYear) === Number(yoy) && Number(keyMonth) === Number(month)) {
                subYoy[item.val] = {
                  label: item.label,
                  value: doc.yoy[key],
                  bulan: Number(keyMonth),
                  data: sort(subDataYoy)[item.val],
                };
              }
            }
          }
        }

        const sortedResultYoy = sort(resultYoy);
        const mainDataYoy = sortedResultYoy && sortedResultYoy.length > 0 ? sortedResultYoy[0] : null;

        yoyList.push({
          label: varKelompokIHK[i].nama,
          value: mainDataYoy ? mainDataYoy.value : 0,
          bulan: mainDataYoy ? Number(mainDataYoy.bulan) : Number(month),
          data: sort(dataYoy),
          sub: subYoy,
        });
      }
    }

    // Transformasi struktur 'sub' menjadi Array untuk HIERARKI
    for (const key in hierarki) {
      const subsObj = hierarki[key].sub || {};
      hierarki[key].sub = Object.entries(subsObj)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => {
          return {
            label: v.label,
            value: v.value,
            bulan: v.bulan,
            data: Object.fromEntries(
              Object.entries(v.data || {}).sort((x, y) => Number(x[0]) - Number(y[0]))
            ),
          };
        });
    }

    // Transformasi struktur 'sub' menjadi Array untuk YOY
    for (const key in yoyList) {
      const subsObjYoy = yoyList[key].sub || {};
      yoyList[key].sub = Object.entries(subsObjYoy)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => {
          return {
            label: v.label,
            value: v.value,
            bulan: v.bulan,
            data: Object.fromEntries(
              Object.entries(v.data || {}).sort((x, y) => Number(x[0]) - Number(y[0]))
            ),
          };
        });
    }

    // Mencari kelompok IHK dengan nilai tertinggi (biggest) dari data hierarki utama
    if (hierarki.length > 0) {
      biggest = hierarki.reduce((max, item) => {
        const currentVal = parseFloat(item.value) || 0;
        const maxVal = parseFloat(max.value) || 0;
        return currentVal > maxVal ? item : max;
      }, hierarki[0]);
    }

    // Kirim response akhir ke Postman
    res.json({
      totalKomoditas: hierarki.length,
      hierarki,
      yoy: yoyList, // Isinya sekarang berupa array berstruktur sama persis dengan hierarki
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
      "var.val": 2223,
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
    const doc = await APIDataBPS.find();
    res.json({ doc });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;