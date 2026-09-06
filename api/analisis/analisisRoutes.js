import express from "express";
import { handleGetInflasiIhk } from "../../controller/analisis/analisisController.js";
import {
  generateWordBrs,
  saveWordAnalysis,
  downloadAnalysisDocx,
  downloadAnalysisPdf,
} from "../../controller/analisis/wordAnalysisController.js";
import { handleGenerateNarasiKelompok } from "../../controller/analisis/narasiKelompokController.js";
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
 * Route untuk generasi narasi andil M-to-M kelompok pengeluaran via LLM (UnifiedLLM/Gemini)
 * POST /api/analisis/keterangan-andil-mtm
 * POST /api/analisis/generate-narasi-kelompok
 */
router.post("/keterangan-andil-mtm", handleGenerateNarasiKelompok);
router.post("/generate-narasi-kelompok", handleGenerateNarasiKelompok);

/**
 * Routes untuk MS Word Editor BRS (Word Engine)
 */
router.post("/word/generate", generateWordBrs);
router.post("/word/save", authMiddleware, saveWordAnalysis);
router.get("/word/:id/download/docx", authMiddleware, downloadAnalysisDocx);
router.get("/word/:id/download/pdf", authMiddleware, downloadAnalysisPdf);

export default router;
