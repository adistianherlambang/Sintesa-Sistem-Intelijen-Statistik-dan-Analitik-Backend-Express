import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";
import { logActivity } from "../user/activityController.js";
import { buildVariableMapFromDataset, renderInflasiIhkTemplate } from "./templateVariableMapper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_DIR = path.resolve(__dirname, "../../export/analysis_files");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const TEMPLATE_LOCATIONS = [
  path.resolve(__dirname, "../../frontend/src/word/engine/template/BERITA.docx"),
  path.resolve(__dirname, "../../../frontend/src/word/engine/template/BERITA.docx"),
  path.resolve(__dirname, "../../../templat/inflasi&ihk/BERITA.docx"),
];

/**
 * Helper: Normalisasi nama file
 */
const sanitizeName = (str) => {
  return String(str || "").replace(/[^a-zA-Z0-9.\-_]/g, "_");
};

/**
 * Controller: Generate initial Word BRS DOCX with ALL Step 3 data placeholders replaced
 * POST /api/analisis/word/generate
 */
export const generateWordBrs = async (req, res) => {
  try {
    const {
      city = "Kota Metro",
      periode = "November 2025",
      title = "Berita Resmi Statistik",
      variables = {},
      dataset = null,
      uploadedDataset = null,
    } = req.body;

    // Find base template BERITA.docx
    let templatePath = "";
    for (const p of TEMPLATE_LOCATIONS) {
      if (fs.existsSync(p)) {
        templatePath = p;
        break;
      }
    }

    if (!templatePath) {
      return res.status(404).json({ message: "Template base BERITA.docx tidak ditemukan di sistem" });
    }

    // 1. Build complete variable mapping from Step 3 data
    const activeDataset = uploadedDataset || dataset || {
      context: { city, period: periode, title }
    };
    const varMap = buildVariableMapFromDataset(activeDataset, variables);

    // 2. Open BERITA.docx and process all XML files (document.xml, footers, headers)
    const zip = new AdmZip(templatePath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.entryName.startsWith("word/") && entry.entryName.endsWith(".xml")) {
        let xmlContent = entry.getData().toString("utf8");
        if (xmlContent.includes("${")) {
          for (const [k, v] of Object.entries(varMap)) {
            if (v !== undefined && v !== null) {
              const token = "${" + k + "}";
              xmlContent = xmlContent.split(token).join(String(v));
            }
          }
          const faxText = varMap["noFax"] ? `Fax: ${varMap["noFax"]}` : "";
          xmlContent = xmlContent.replace(/\$\{fax\b[^}]*\}/g, faxText);
          xmlContent = xmlContent.replace(/\$\{[^}]+\}/g, "");
          zip.updateFile(entry.entryName, Buffer.from(xmlContent, "utf8"));
        }
      }
    }

    const cleanCity = String(varMap["namaKota"] || city).replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, "");
    const cleanPeriod = String(varMap["bulanTahun"] || periode);
    const timestamp = Date.now();
    const outFilename = `brs_${sanitizeName(cleanCity)}_${sanitizeName(cleanPeriod)}_${timestamp}.docx`;
    const outPath = path.join(EXPORT_DIR, outFilename);

    zip.writeZip(outPath);

    const renderedTemplateData = renderInflasiIhkTemplate(activeDataset, variables);

    return res.json({
      success: true,
      filename: outFilename,
      url: `/analysis-files/${outFilename}`,
      fullUrl: `${req.protocol}://${req.get("host")}/analysis-files/${outFilename}`,
      variablesCount: Object.keys(varMap).length,
      variables: varMap,
      renderedTemplate: renderedTemplateData?.template || null,
    });
  } catch (err) {
    console.error("[generateWordBrs] Error:", err.message);
    return res.status(500).json({ message: "Gagal men-generate template Word: " + err.message });
  }
};

/**
 * Controller: Simpan hasil analisis dari MS Word Editor ke database (DOCX dan PDF)
 * POST /api/analisis/word/save
 */
export const saveWordAnalysis = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Pengguna tidak terautentikasi" });
    }

    const {
      title,
      periode,
      city,
      docxBase64,
      pdfBase64,
      docxFilename: reqDocxName,
      pdfFilename: reqPdfName,
    } = req.body;

    const targetCity = city || "Kota Metro";
    const periodText = periode || new Date().toLocaleString("id-ID", { month: "long", year: "numeric" });
    const reportTitle = title || `Laporan BRS ${targetCity} - ${periodText}`;

    const timestamp = Date.now();
    const cleanCity = sanitizeName(targetCity);
    const cleanPeriod = sanitizeName(periodText);
    const baseName = `${userId}_${timestamp}_brs_${cleanCity}_${cleanPeriod}`;

    let finalDocxFilename = "";
    let finalPdfFilename = "";

    // Handle DOCX payload
    if (docxBase64) {
      const docxBuffer = Buffer.from(
        docxBase64.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      finalDocxFilename = `${baseName}.docx`;
      fs.writeFileSync(path.join(EXPORT_DIR, finalDocxFilename), docxBuffer);
    } else if (reqDocxName && fs.existsSync(path.join(EXPORT_DIR, reqDocxName))) {
      finalDocxFilename = reqDocxName;
    }

    // Handle PDF payload
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(
        pdfBase64.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      finalPdfFilename = `${baseName}.pdf`;
      fs.writeFileSync(path.join(EXPORT_DIR, finalPdfFilename), pdfBuffer);
    } else if (reqPdfName && fs.existsSync(path.join(EXPORT_DIR, reqPdfName))) {
      finalPdfFilename = reqPdfName;
    }

    if (!finalDocxFilename && !finalPdfFilename) {
      return res.status(400).json({ message: "File DOCX atau PDF harus dikirimkan" });
    }

    const history = new AnalysisHistory({
      userId,
      title: reportTitle,
      periode: periodText,
      analysisFile: finalDocxFilename || finalPdfFilename,
      docxFile: finalDocxFilename,
      pdfFile: finalPdfFilename,
    });

    await history.save();
    await logActivity(userId, `Menyimpan laporan analisis Word BRS: ${reportTitle}`);

    return res.status(201).json({
      success: true,
      message: "Laporan analisis berhasil disimpan ke database dalam format DOCX dan PDF",
      historyId: history._id,
      title: history.title,
      periode: history.periode,
      docxFile: finalDocxFilename,
      pdfFile: finalPdfFilename,
      docxUrl: finalDocxFilename ? `/analysis-files/${finalDocxFilename}` : null,
      pdfUrl: finalPdfFilename ? `/analysis-files/${finalPdfFilename}` : null,
    });
  } catch (err) {
    console.error("[saveWordAnalysis] Error:", err.message);
    return res.status(500).json({ message: "Gagal menyimpan dokumen analisis: " + err.message });
  }
};

/**
 * Controller: Unduh file DOCX
 * GET /api/analisis/word/:id/download/docx
 */
export const downloadAnalysisDocx = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await AnalysisHistory.findById(id).lean();
    if (!history) {
      return res.status(404).json({ message: "Riwayat analisis tidak ditemukan" });
    }

    if (history.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const filename = history.docxFile || history.analysisFile;
    if (!filename) {
      return res.status(404).json({ message: "File DOCX tidak ditemukan untuk riwayat ini" });
    }

    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Berkas fisik DOCX tidak ditemukan di server" });
    }

    await logActivity(req.user._id, `Mengunduh berkas Word DOCX untuk: ${history.title}`);
    const downloadName = `${sanitizeName(history.title)}.docx`;
    return res.download(filePath, downloadName);
  } catch (err) {
    console.error("[downloadAnalysisDocx] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Controller: Unduh file PDF
 * GET /api/analisis/word/:id/download/pdf
 */
export const downloadAnalysisPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await AnalysisHistory.findById(id).lean();
    if (!history) {
      return res.status(404).json({ message: "Riwayat analisis tidak ditemukan" });
    }

    if (history.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const filename = history.pdfFile || (history.docxFile ? history.docxFile.replace(/\.docx$/, ".pdf") : "");
    if (!filename) {
      return res.status(404).json({ message: "File PDF tidak ditemukan untuk riwayat ini" });
    }

    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Berkas fisik PDF tidak ditemukan di server" });
    }

    await logActivity(req.user._id, `Mengunduh berkas PDF untuk: ${history.title}`);
    const downloadName = `${sanitizeName(history.title)}.pdf`;
    return res.download(filePath, downloadName);
  } catch (err) {
    console.error("[downloadAnalysisPdf] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};
