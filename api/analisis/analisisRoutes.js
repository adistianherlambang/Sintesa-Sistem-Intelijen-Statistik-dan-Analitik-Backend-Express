import express from "express";
import { handleGetInflasiIhk } from "../../controller/analisis/analisisController.js";
import {
  generateWordBrs,
  saveWordAnalysis,
  downloadAnalysisDocx,
  downloadAnalysisPdf,
} from "../../controller/analisis/wordAnalysisController.js";
import { authMiddleware } from "../../controller/user/authMiddleware.js";

const router = express.Router();

/**
 * Route untuk mengambil seluruh data inflasi & IHK (Umum & Komoditas) sekaligus
 * POST /api/analisis/inflasi-ihk  -> body: { kota: "..." }
 * GET  /api/analisis/inflasi-ihk  -> query: ?kota=...
 */
router.post("/inflasi-ihk", handleGetInflasiIhk);
router.get("/inflasi-ihk", handleGetInflasiIhk);

/**
 * Routes untuk MS Word Editor BRS (Word Engine)
 */
router.post("/word/generate", generateWordBrs);
router.post("/word/save", authMiddleware, saveWordAnalysis);
router.get("/word/:id/download/docx", authMiddleware, downloadAnalysisDocx);
router.get("/word/:id/download/pdf", authMiddleware, downloadAnalysisPdf);

export default router;
