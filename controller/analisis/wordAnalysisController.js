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
 * Generate XML baris tabel 3 (IHK Bulanan 3 Tahun) sesuai inflasiIHK.json
 */
function buildTable3RowsXml() {
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const mLower = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];

  let rows = "";
  // Header row - background #f68839 (F68839)
  rows += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    '<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F68839"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="16"/></w:rPr><w:t>Periode</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F68839"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="16"/></w:rPr><w:t>${tahun1}</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F68839"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="16"/></w:rPr><w:t>${tahun2}</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F68839"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="16"/></w:rPr><w:t>${tahun3}</w:t></w:r></w:p></w:tc>' +
    '</w:tr>' +
    // Numbering row - background #ffd684 (FFD684)
    '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    '<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFD684"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:color w:val="475569"/><w:sz w:val="14"/></w:rPr><w:t>(1)</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFD684"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:color w:val="475569"/><w:sz w:val="14"/></w:rPr><w:t>(2)</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFD684"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:color w:val="475569"/><w:sz w:val="14"/></w:rPr><w:t>(3)</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFD684"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:color w:val="475569"/><w:sz w:val="14"/></w:rPr><w:t>(4)</w:t></w:r></w:p></w:tc>' +
    '</w:tr>';

  // Monthly rows with alternating colors #fff5e6 and #fff0d3
  months.forEach((m, idx) => {
    const rowColor = (idx % 2 === 0) ? "FFF5E6" : "FFF0D3";
    const vp = mLower[idx];
    rows += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
      '<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + rowColor + '"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/></w:rPr><w:t>' + m + '</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + rowColor + '"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/></w:rPr><w:t>${' + vp + 'Tahun1}</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + rowColor + '"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/></w:rPr><w:t>${' + vp + 'Tahun2}</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + rowColor + '"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="30" w:after="30"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/></w:rPr><w:t>${' + vp + 'Tahun3}</w:t></w:r></w:p></w:tc>' +
      '</w:tr>';
  });
  return rows;
}

/**
 * Generate XML Section 2 (2 kolom: Penjelasan Teknis & Perubahan Tahun Dasar + Tabel 3)
 */
function buildSection2WordXml() {
  const table3Rows = buildTable3RowsXml();
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
    '<w:tr>' +
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FEE3CE"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>  Penjelasan Teknis</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>SBH 2022 dilaksanakan di 150 kabupaten/kota, yang terdiri dari 38 ibukota provinsi dan 112 kabupaten/kota. Dari 150 kabupaten/kota tersebut, 90 kota merupakan lanjutan kabupaten/kota SBH 2018 yang mencakup wilayah urban dan 60 kabupaten merupakan kabupaten tambahan yang mencakup wilayah urban dan rural. Survei ini dilaksanakan di daerah perkotaan dan pedesaan dengan total sampel sebanyak 240.000 rumah tangga. Paket komoditas hasil SBH 2022 ${namaKota} berjumlah 271 komoditas.</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>Pengelompokan komoditas didasarkan pada Classification of Individual Consumption According to Purpose (COICOP) 2018. Secara nasional pengelompokan komoditas terdiri dari 11 kelompok dan 43 subkelompok. Adapun untuk level Kabupaten/Kota/Provinsi pengelompokan komoditas terdiri dari 11 kelompok dan dapat bervariasi jumlah subkelompoknya.</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>Perubahan metodologi IHK (2022=100) dalam pemutakhiran Diagram Timbang dan penghitungan Indeks Harga Konsumen mengacu pada Manual standar internasional (CPI Manual 2020).</w:t></w:r></w:p>' +
    '</w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="400" w:type="dxa"/></w:tcPr><w:p/></w:tc>' +
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FEE3CE"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>  Perubahan Tahun Dasar</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>Adanya pergantian tahun dasar yang baru menyebabkan diskontinuitas indeks harga antara periode berjalan dengan periode sebelumnya. Tabel 3 menyajikan IHK ${wilayah} pada Januari ${tahunAwal} sampai dengan ${bulan} ${tahunAkhir} menurut tahun dasar 2022=100.</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:spacing w:before="60" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="15"/><w:color w:val="1E293B"/></w:rPr><w:t>Tabel 3 IHK ${wilayah} Menurut Bulan (2022=100), ${tahunAwal}–${tahunAkhir}</w:t></w:r></w:p>' +
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="4600" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:left w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:right w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders></w:tblPr>' +
    table3Rows +
    '</w:tbl>' +
    '</w:tc>' +
    '</w:tr>' +
    '</w:tbl>';
}

/**
 * Terapkan styling resmi dari inflasiIHK.json pada document.xml
 */
export function applyInflasiIhkStylingToXml(xmlContent) {
  let xml = xmlContent;

  // 1. Header tabel: Ganti biru (2B6CB0) dengan Orange BPS (F68839)
  xml = xml.split("2B6CB0").join("F68839");
  xml = xml.split("2b6cb0").join("F68839");

  // 2. Heading title: Ganti biru tua (1E3A8A) dengan Orange BPS (F68839)
  xml = xml.split("1E3A8A").join("F68839");
  xml = xml.split("1e3a8a").join("F68839");

  // 3. Numbering cell: Ganti abu (E2E8F0) dengan Amber (FFD684)
  xml = xml.split("E2E8F0").join("FFD684");
  xml = xml.split("e2e8f0").join("FFD684");

  // 4. Alternating rows: F8FAFC -> FFF0D3
  xml = xml.split("F8FAFC").join("FFF0D3");
  xml = xml.split("f8fafc").join("FFF0D3");

  // 5. Injeksi Section 2 jika belum ada (Penjelasan Teknis & Perubahan Tahun Dasar + Tabel 3)
  const contactMarker = "Konten Berita Resmi Statistik dilindungi oleh Undang-Undang";
  if (!xml.includes("Penjelasan Teknis") && xml.includes(contactMarker)) {
    const contactIdx = xml.lastIndexOf("<w:tbl", xml.indexOf(contactMarker));
    if (contactIdx !== -1) {
      const sec2 = buildSection2WordXml();
      xml = xml.slice(0, contactIdx) + sec2 + xml.slice(contactIdx);
    }
  }

  return xml;
}

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
        
        // Terapkan styling resmi inflasiIHK.json (Orange #f68839, Amber #ffd684, Cream #fff5e6/d3, Peach #fee3ce)
        if (entry.entryName === "word/document.xml") {
          xmlContent = applyInflasiIhkStylingToXml(xmlContent);
        }

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
        } else if (entry.entryName === "word/document.xml") {
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
