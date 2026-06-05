import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.resolve(__dirname, "../../export/analysis_files");

// Make sure the export/analysis_files directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * Add a report analysis history with an IDML file upload
 */
export const addAnalysisHistory = async (userId, title, periode, fileBuffer, originalName = "analysis.idml") => {
  if (!userId || !title || !periode || !fileBuffer) {
    throw new Error("userId, title, periode, dan fileBuffer wajib diisi");
  }

  // Generate a unique filename
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const filename = `${userId}_${timestamp}_${safeName}`;
  const filePath = path.join(EXPORT_DIR, filename);

  // Write file to export/analysis_files/
  fs.writeFileSync(filePath, fileBuffer);

  const history = new AnalysisHistory({
    userId,
    title,
    periode,
    analysisFile: filename,
  });

  await history.save();
  return history;
};

/**
 * Get analysis history list for a user
 */
export const getUserAnalysisHistory = async (userId) => {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }

  return await AnalysisHistory.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Resolve and verify file path for download
 */
export const getAnalysisFilePath = async (userId, historyId) => {
  if (!userId || !historyId) {
    throw new Error("userId dan historyId wajib diisi");
  }

  const history = await AnalysisHistory.findById(historyId).lean();
  if (!history) {
    throw new Error("Riwayat analisis tidak ditemukan");
  }

  // Security check: Ensure the history belongs to the requesting user
  if (history.userId.toString() !== userId.toString()) {
    throw new Error("Akses ditolak. Riwayat analisis bukan milik Anda.");
  }

  const filePath = path.join(EXPORT_DIR, history.analysisFile);
  if (!fs.existsSync(filePath)) {
    throw new Error("File IDML tidak ditemukan di server");
  }

  return {
    filePath,
    filename: history.title.replace(/[^a-zA-Z0-9]/g, "_") + ".idml"
  };
};
