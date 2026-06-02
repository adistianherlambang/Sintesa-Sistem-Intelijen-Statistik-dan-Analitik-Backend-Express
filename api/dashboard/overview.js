import mongoose from "mongoose";
import dotenv from "dotenv";
import e from "express";

// models
import APIDataBPS from "../../db/models/APIDataBPS.js";

// json
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };

dotenv.config();

const router = e.Router();

// Tanggal dan tahun yang digunakan untuk endpoint IHK
const date = new Date();
const month = String(date.getMonth() - 1);
const year = "1" + String(date.getFullYear()).slice(2, 4);
const yoy = year - 1;

// Helper: sort objek atau array berdasarkan nomor key
const sort = (itemSorted) => {
  if (Array.isArray(itemSorted)) {
    return [...itemSorted].sort((a, b) => Number(a.key) - Number(b.key));
  }

  return Object.fromEntries(
    Object.entries(itemSorted).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
};

// Helper: ambil nilai akhir dan selisih dari array yang sudah terurut
const getLastTwoValues = (sorted) => {
  const now = sorted.length > 0 ? sorted[sorted.length - 1].value : 0;
  const then = sorted.length > 1 ? sorted[sorted.length - 2].value : 0;
  const compare = now - then;
  return { now, compare };
};

// Helper: bangun array {key, value} berdasarkan region, prefix, dan filter opsional
const buildFilteredKeyValue = (documentSection, regionVal, prefix, yearFilter = null, monthFilter = null) => {
  const result = [];

  for (const key in documentSection) {
    const startsWithRegion = key.startsWith(regionVal);
    const hasPrefix = key.slice(regionVal.length, regionVal.length + 1) === String(prefix);

    if (!startsWithRegion || !hasPrefix) continue;

    if (yearFilter !== null || monthFilter !== null) {
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
      const keyMonth = key.slice(regionVal.length + 11);

      if (yearFilter !== null && Number(keyYear) !== Number(yearFilter)) continue;
      if (monthFilter !== null && Number(keyMonth) !== Number(monthFilter)) continue;
    }

    result.push({
      key,
      value: documentSection[key],
    });
  }

  return result;
};

// Helper: bangun response JSON untuk inflasi / ihk dengan dashboard
const buildResponseWithDashboard = (kota, inflasiVar, regionVal, result, sortedYoy) => {
  const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));
  const { now, compare } = getLastTwoValues(sorted);

  return {
    kota,
    var: inflasiVar,
    regionVal,
    total: result.length,
    data: sorted,
    dashboard: {
      now,
      compare: Number(compare.toFixed(2)),
    },
    yoy: sortedYoy,
  };
};

router.post("/inflasi", async (req, res) => {
  try {
    const { kota } = req.body;

    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    // Ambil dokumen inflasi dengan var.val = 1
    const doc = await APIDataBPS.findOne({
      "var.val": 1,
    })
      .select("var vervar datacontent yoy")
      .lean();

    if (!doc) {
      return res.status(404).json({
        message: "data inflasi tidak ditemukan",
      });
    }

    const inflasiVar = doc.var.find((item) => item.val === 1);
    const region = doc.vervar.find((item) => item.label === kota);

    if (!region) {
      return res.status(404).json({
        message: "kota tidak ditemukan",
      });
    }

    const regionVal = region.val.toString();

    const result = buildFilteredKeyValue(doc.datacontent, regionVal, 1);
    const resultYoy = buildFilteredKeyValue(doc.yoy || {}, regionVal, 1);
    const sortedYoy = [...resultYoy].sort((a, b) => Number(a.key) - Number(b.key));

    res.json(buildResponseWithDashboard(kota, inflasiVar, regionVal, result, sortedYoy));
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

    const inflasiVar = doc.var.find((item) => item.val === 2245);
    const region = doc.vervar.find((item) => item.label === kota);

    if (!region) {
      return res.status(404).json({
        message: "kota tidak ditemukan",
      });
    }

    const regionVal = region.val.toString();
    const result = buildFilteredKeyValue(doc.datacontent, regionVal, 2);
    const resultYoy = buildFilteredKeyValue(doc.yoy || {}, regionVal, 2);
    const sortedYoy = [...resultYoy].sort((a, b) => Number(a.key) - Number(b.key));

    res.json(buildResponseWithDashboard(kota, inflasiVar, regionVal, result, sortedYoy));
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

    if (!kota) {
      return res.status(400).json({
        message: "kota wajib diisi",
      });
    }

    let hierarki = [];
    let yoyList = [];
    let biggest = null;

    for (const i in varKelompokIHK) {
      const doc = await APIDataBPS.findOne({
        "var.val": varKelompokIHK[i].var,
        "turvar.val": varKelompokIHK[i].turvar,
      })
        .select("var vervar datacontent yoy")
        .lean();

      if (!doc || !doc.vervar) continue;

      const region = doc.vervar.find((item) => item.label === kota);
      if (!region) continue;

      const regionVal = region.val.toString();
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

            if (
              key.startsWith(regionVal) &&
              turvar === String(item.val) &&
              Number(keyYear) === Number(year) &&
              Number(keyMonth) === Number(month)
            ) {
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
        sub,
      });

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
            Number(keyYear) === Number(yoy)
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

              if (
                key.startsWith(regionVal) &&
                turvar === String(item.val) &&
                Number(keyYear) === Number(yoy) &&
                Number(keyMonth) === Number(month)
              ) {
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

    for (const key in hierarki) {
      const subsObj = hierarki[key].sub || {};
      hierarki[key].sub = Object.entries(subsObj)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => ({
          label: v.label,
          value: v.value,
          bulan: v.bulan,
          data: Object.fromEntries(
            Object.entries(v.data || {}).sort((x, y) => Number(x[0]) - Number(y[0])),
          ),
        }));
    }

    for (const key in yoyList) {
      const subsObjYoy = yoyList[key].sub || {};
      yoyList[key].sub = Object.entries(subsObjYoy)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => ({
          label: v.label,
          value: v.value,
          bulan: v.bulan,
          data: Object.fromEntries(
            Object.entries(v.data || {}).sort((x, y) => Number(x[0]) - Number(y[0])),
          ),
        }));
    }

    if (hierarki.length > 0) {
      biggest = hierarki.reduce((max, item) => {
        const currentVal = parseFloat(item.value) || 0;
        const maxVal = parseFloat(max.value) || 0;
        return currentVal > maxVal ? item : max;
      }, hierarki[0]);
    }

    res.json({
      totalKomoditas: hierarki.length,
      hierarki,
      yoy: yoyList,
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
      // Endpoint ini saat ini tidak mengembalikan data tambahan.
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
