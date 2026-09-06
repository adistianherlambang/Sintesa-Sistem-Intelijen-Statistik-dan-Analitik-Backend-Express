import express from "express";
import { handleGetInflasiIhk } from "../../controller/analisis/analisisController.js";

const router = express.Router();

/**
 * Route untuk mengambil seluruh data inflasi & IHK (Umum & Komoditas) sekaligus
 * POST /api/analisis/inflasi-ihk  -> body: { kota: "..." }
 * GET  /api/analisis/inflasi-ihk  -> query: ?kota=...
 */
router.post("/inflasi-ihk", handleGetInflasiIhk);
router.get("/inflasi-ihk", handleGetInflasiIhk);

export default router;
