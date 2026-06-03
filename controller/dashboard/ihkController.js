import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
} from "./helpers.js";

/**
 * POST /dashboard/ihk
 * Dapatkan data IHK untuk kota tertentu
 */
export const getIhkByKota = async (req, res) => {
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
        message: "data IHK tidak ditemukan",
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
 * GET /dashboard/ihk
 * Dapatkan dokumen IHK lengkap
 */
export const getAllIhk = async (req, res) => {
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
};
