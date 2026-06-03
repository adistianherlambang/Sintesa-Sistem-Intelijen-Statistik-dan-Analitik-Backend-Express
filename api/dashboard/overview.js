import e from "express";
import dotenv from "dotenv";

// Controllers (pure functions)
import { getInflasiByKota, getAllInflasi } from "../../controller/dashboard/inflasiController.js";
import { getIhkByKota, getAllIhk } from "../../controller/dashboard/ihkController.js";
import { getKomoditasByKota, getAllKomoditas } from "../../controller/dashboard/komoditasController.js";
import { testBPSAPI, getAllDashboard } from "../../controller/dashboard/dashboardController.js";

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

router.get("/inflasi", async (req, res) => {
  try {
    const result = await getAllInflasi();
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
