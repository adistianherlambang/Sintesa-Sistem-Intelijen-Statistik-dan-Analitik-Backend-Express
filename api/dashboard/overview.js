import e from "express";
import dotenv from "dotenv";

// Controllers (pure functions)
import {
  getInflasiByKota,
  getAllInflasi,
  getInflasiInfografisByKota,
  getInflasiYoyByKota,
  getAllInflasiYoy,
  getInflasiYtdByKota,
  getAllInflasiYtd,
} from "../../controller/dashboard/inflasiController.js";
import {
  getIhkByKota,
  getAllIhk,
  getIhkInfografisByKota,
} from "../../controller/dashboard/ihkController.js";
import {
  getKomoditasByKota,
  getAllKomoditas,
  getKomoditasInfografisByKota,
} from "../../controller/dashboard/komoditasController.js";
import {
  testBPSAPI,
  getAllDashboard,
} from "../../controller/dashboard/dashboardController.js";
import { getAISummaryByKota } from "../../controller/dashboard/AISummaryController.js";
import {
  parseAndVerifyDataset,
  generateBRS,
  generateSummary,
  generateAndSaveBRS,
} from "../../controller/dashboard/analysisController.js";
import { authMiddleware } from "../../controller/user/authMiddleware.js";
import ForecastResult from "../../db/models/ForecastResult.js";

dotenv.config();

const router = e.Router();

/**
 * ============= ERROR HANDLING =============
 * Centralized error response handler
 */
const handleError = (res, error, statusCode = 500) => {
  const message = error.message || "Internal server error";

  // Determine status code based on error message
  if (message.includes("wajib diisi")) {
    return res.status(400).json({ message });
  }
  if (message.includes("tidak ditemukan")) {
    return res.status(404).json({ message });
  }

  res.status(statusCode).json({ message });
};

// ============= FORECASTING ROUTES =============
router.post("/forecast/save", async (req, res) => {
  try {
    const { kota, regionVal_ihk, regionVal_inflasi, forecast } = req.body;
    if (!kota) {
      return res.status(400).json({ message: "Nama kota wajib diisi" });
    }

    const doc = await ForecastResult.findOneAndUpdate(
      { kota },
      {
        $set: {
          regionVal_ihk,
          regionVal_inflasi,
          forecast,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    res.json({
      message: `Hasil peramalan untuk ${kota} berhasil disimpan.`,
      data: doc,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/forecast/:kota", async (req, res) => {
  try {
    const { kota } = req.params;
    const doc = await ForecastResult.findOne({ kota });
    if (!doc) {
      return res
        .status(404)
        .json({ message: `Hasil peramalan untuk ${kota} tidak ditemukan.` });
    }
    res.json(doc);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/forecast", async (req, res) => {
  try {
    const list = await ForecastResult.find(
      {},
      "kota regionVal_ihk regionVal_inflasi updatedAt",
    );
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

// ============= INFLASI ROUTES =============
router.post("/inflasi", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getInflasiByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/inflasi-infografis", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getInflasiInfografisByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/inflasi", async (req, res) => {
  try {
    const result = await getAllInflasi();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/inflasi/yoy", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getInflasiYoyByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/inflasi/yoy", async (req, res) => {
  try {
    const result = await getAllInflasiYoy();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/inflasi/ytd", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getInflasiYtdByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/inflasi/ytd", async (req, res) => {
  try {
    const result = await getAllInflasiYtd();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ============= IHK ROUTES =============
router.post("/ihk", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getIhkByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/ihk-infografis", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getIhkInfografisByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/ihk", async (req, res) => {
  try {
    const result = await getAllIhk();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ============= KOMODITAS ROUTES =============
router.get("/komoditas", async (req, res) => {
  try {
    const result = await getAllKomoditas();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/komoditas", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getKomoditasByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/komoditas-infografis", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getKomoditasInfografisByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/aisummary", async (req, res) => {
  try {
    const { kota } = req.body;
    const result = await getAISummaryByKota(kota);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/upload-dataset", parseAndVerifyDataset);
router.post("/generate-brs", generateBRS);
router.post("/generate-summary", generateSummary);
router.post("/generate-and-save-brs", authMiddleware, generateAndSaveBRS);

// ============= TEST & GENERAL ROUTES =============
router.post("/testapi", async (req, res) => {
  try {
    const result = await testBPSAPI();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await getAllDashboard();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
