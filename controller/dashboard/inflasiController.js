import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
} from "./helpers.js";

/**
 * POST /dashboard/inflasi
 * Dapatkan data inflasi untuk kota tertentu
 */
export const getInflasiByKota = async (req, res) => {
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
    const sortedYoy = [...resultYoy].sort(
      (a, b) => Number(a.key) - Number(b.key),
    );

    res.json(
      buildResponseWithDashboard(
        kota,
        inflasiVar,
        regionVal,
        result,
        sortedYoy,
      ),
    );
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};

/**
 * GET /dashboard/inflasi
 * Dapatkan dokumen inflasi lengkap
 */
export const getAllInflasi = async (req, res) => {
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
};
