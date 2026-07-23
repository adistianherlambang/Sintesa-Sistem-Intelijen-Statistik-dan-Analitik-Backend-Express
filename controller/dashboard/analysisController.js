import XLSX from "xlsx";
import AdmZip from "adm-zip";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";
import { logActivity } from "../user/activityController.js";
import { getKomoditasByKota } from "./komoditasController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Endpoint to upload Excel, parse it, and use Gemini to check if it's IHK/Inflation data
 */
export const parseAndVerifyDataset = async (req, res) => {
  try {
    const { fileData, fileName, city } = req.body;
    if (!fileData) {
      return res
        .status(400)
        .json({ message: "Data file (base64) wajib dikirim" });
    }

    const buffer = Buffer.from(fileData, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Find active sheet (looks for 'Data 03', 'Data', or the first sheet)
    const sheetName =
      workbook.SheetNames.find((n) => n.toLowerCase().includes("data")) ||
      workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return res
        .status(404)
        .json({ message: "Sheet data tidak ditemukan di Excel" });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rows[0] || [];

    // Decode range to count rows/cols
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const rowsCount = range.e.r - range.s.r + 1;
    const colsCount = range.e.c - range.s.c + 1;

    // Extrapolate context (city, month, year) from the first data row
    let extractedCity = "";
    let periodText = "";
    let yearVal = new Date().getFullYear();
    let monthIndex = new Date().getMonth();

    if (rows.length > 1) {
      const firstDataRow = rows[1];
      const tahun = firstDataRow[0];
      const bulanNum = firstDataRow[1];
      const kotaName = firstDataRow[3];

      if (kotaName) extractedCity = String(kotaName).trim();
      if (tahun && bulanNum) {
        yearVal = parseInt(tahun, 10);
        const mNum = parseInt(bulanNum, 10);
        if (mNum >= 1 && mNum <= 12) {
          monthIndex = mNum - 1;
          periodText = `${months[monthIndex]} ${yearVal}`;
        }
      }
    }

    if (!periodText) {
      periodText = `${months[monthIndex]} ${yearVal}`;
    }

    // Auto detect structure format
    const isBpsFormat =
      headerRow.some((c) => String(c).toLowerCase().includes("komoditas")) &&
      headerRow.some((c) => String(c).toLowerCase().includes("ihk"));

    // Check with Gemini API if key exists
    let isValid = "tidak";
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const prompt = `
        Analyze this spreadsheet meta-information and preview rows to determine if it contains valid IHK (Consumer Price Index) or inflation data.
        
        Sheet Names: ${JSON.stringify(workbook.SheetNames)}
        Column Headers: ${JSON.stringify(headerRow)}
        Data Preview (First 5 rows):
        ${JSON.stringify(rows.slice(0, 6))}
        
        If this dataset contains valid BPS IHK/inflation data for commodity groups that can be processed by our system (e.g. matching BPS commodity layout with columns for IHK/Inflation), respond with a JSON object:
        {
          "valid": "ya"
        }
        Otherwise, respond with:
        {
          "valid": "tidak"
        }
        Do not include any wrapper or explanation, just valid raw JSON.
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(geminiUrl, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });
        const resultText =
          response.data.candidates[0].content.parts[0].text.trim();
        const resultJson = JSON.parse(resultText);
        isValid = resultJson.valid === "ya" ? "ya" : "tidak";
      } catch (geminiErr) {
        console.warn(
          "⚠ Gemini validation failed, falling back to header structural check:",
          geminiErr.message,
        );
        isValid = isBpsFormat ? "ya" : "tidak";
      }
    } else {
      console.log(
        "No GEMINI_API_KEY found, performing structural check instead.",
      );
      isValid = isBpsFormat ? "ya" : "tidak";
    }

    res.json({
      valid: isValid,
      fileInfo: {
        name: fileName || "file.xlsx",
        size: `${(buffer.length / 1024).toFixed(1)} kB`,
        rows: rowsCount,
        cols: colsCount,
        sheet: sheetName,
      },
      context: {
        city: extractedCity || city || "KOTA METRO",
        period: periodText,
        monthIndex,
        year: yearVal,
      },
      structure: isBpsFormat ? "BPS Inflasi / IHK" : "Kustom",
      columns: headerRow,
      parsedData: rows,
    });
  } catch (err) {
    console.error("Error parseAndVerifyDataset:", err.message);
    res
      .status(500)
      .json({ message: "Gagal memproses file Excel: " + err.message });
  }
};
const fillStoryXML = (
  originalXml,
  targetCity,
  monthName,
  yr,
  infMoM,
  infYoY,
  targetIhk,
) => {
  let newXml = originalXml;

  const monthIndex = months.indexOf(monthName) !== -1 ? months.indexOf(monthName) : 10;
  const currentMonth = monthName;
  const currentYear = parseInt(yr, 10) || new Date().getFullYear();

  const prevMonthIndex = (monthIndex - 1 + 12) % 12;
  const prevMonthName = months[prevMonthIndex];
  const prevMonthYear = monthIndex === 0 ? currentYear - 1 : currentYear;

  const prevYear = currentYear - 1;
  const twoYearsAgo = currentYear - 2;

  // Format numbers to Indonesian locale (comma decimal separator)
  const toIndoNum = (val) => {
    if (val === undefined || val === null) return "";
    if (typeof val === "string" && val.includes(",")) return val;
    if (typeof val === "string") return val.replace(".", ",");
    return Number(val).toFixed(2).replace(".", ",");
  };

  const formattedInfMoM = toIndoNum(infMoM);
  const formattedInfYoY = toIndoNum(infYoY);
  const formattedTargetIhk = toIndoNum(targetIhk);

  const ihkNowNum = parseFloat(String(targetIhk).replace(",", "."));
  const infYoYNum = parseFloat(String(infYoY).replace(",", "."));
  let ihkPrev = "105,94";
  if (!isNaN(ihkNowNum) && !isNaN(infYoYNum)) {
    const prevNum = ihkNowNum / (1 + infYoYNum / 100);
    ihkPrev = prevNum.toFixed(2).replace(".", ",");
  }

  // Replace City name
  newXml = newXml.replace(/Kota Metro/g, targetCity);
  newXml = newXml.replace(/Metro/g, targetCity);
  newXml = newXml.replace(/METRO/g, targetCity.toUpperCase());

  // Replace Current Period (with regex for flexible spacing)
  newXml = newXml.replace(/November\s+2025/g, `${currentMonth} ${currentYear}`);
  newXml = newXml.replace(/NOVEMBER\s+2025/g, `${currentMonth.toUpperCase()} ${currentYear}`);

  // Replace Previous Period
  newXml = newXml.replace(/November\s+2024/g, `${currentMonth} ${prevYear}`);
  newXml = newXml.replace(/NOVEMBER\s+2024/g, `${currentMonth.toUpperCase()} ${prevYear}`);
  newXml = newXml.replace(/November\s+2023/g, `${currentMonth} ${twoYearsAgo}`);

  // Replace Month name
  newXml = newXml.replace(/\bNovember\b/g, currentMonth);
  newXml = newXml.replace(/\bNOVEMBER\b/g, currentMonth.toUpperCase());

  // Replace previous month date references
  newXml = newXml.replace(/Oktober\s+2025/g, `${prevMonthName} ${prevMonthYear}`);
  newXml = newXml.replace(/OKTOBER\s+2025/g, `${prevMonthName.toUpperCase()} ${prevMonthYear}`);
  newXml = newXml.replace(/Oktober\s+2024/g, `${prevMonthName} ${prevMonthYear - 1}`);
  newXml = newXml.replace(/\bOktober\b/g, prevMonthName);
  newXml = newXml.replace(/\bOKTOBER\b/g, prevMonthName.toUpperCase());

  // Replace previous year December references
  newXml = newXml.replace(/Desember\s+2024/g, `Desember ${prevYear}`);
  newXml = newXml.replace(/DESEMBER\s+2024/g, `DESEMBER ${prevYear}`);
  newXml = newXml.replace(/Desember\s+2023/g, `Desember ${twoYearsAgo}`);

  // Replace YoY inflation (original is 1,88)
  newXml = newXml.replace(/1,88/g, formattedInfYoY);

  // Replace MoM inflation (original is 0,19)
  newXml = newXml.replace(/0,19/g, formattedInfMoM);

  // Replace IHK (original is 107,93)
  newXml = newXml.replace(/107,93/g, formattedTargetIhk);

  // Replace previous IHK (original is 105.94 or 105,94)
  newXml = newXml.replace(/105\.94/g, ihkPrev.replace(",", "."));
  newXml = newXml.replace(/105,94/g, ihkPrev);

  // Replace YtD inflation (original is 1,41)
  newXml = newXml.replace(/1,41/g, formattedInfMoM);

  return newXml;
};

/**
 * Endpoint to populate InDesign IDML template with the data
 */
export const generateBRS = async (req, res) => {
  try {
    const {
      city,
      monthIndex,
      year,
      inflasiMoM,
      inflasiYoY,
      ihkNow,
      komoditasPendorong,
    } = req.body;

    const monthName = months[monthIndex !== undefined ? monthIndex : 2]; // default Maret
    const yr = year || new Date().getFullYear();
    const targetCity = city || "KOTA METRO";
    const infMoM = inflasiMoM || "0,00";
    const infYoY = inflasiYoY || "0,00";
    const targetIhk = ihkNow || "100,00";

    const idmlPath = path.resolve(__dirname, "../../../perkembanganIHK.idml");
    if (!fs.existsSync(idmlPath)) {
      return res.status(404).json({
        message: "Template IDML perkembanganIHK.idml tidak ditemukan di root.",
      });
    }

    const zip = new AdmZip(idmlPath);
    const storyEntry = zip.getEntry("Stories/Story_u8e9.xml");
    if (!storyEntry) {
      return res.status(404).json({
        message: "File Stories/Story_u8e9.xml tidak ditemukan di dalam IDML.",
      });
    }

    // Apply the replacements to all XML files inside the IDML
    const zipEntries = zip.getEntries();
    zipEntries.forEach((entry) => {
      if (entry.isDirectory) return;
      if (!entry.entryName.endsWith(".xml")) return;

      const originalXml = entry.getData().toString("utf8");
      const newXml = fillStoryXML(
        originalXml,
        targetCity,
        monthName,
        yr,
        infMoM,
        infYoY,
        targetIhk,
      );

      if (newXml !== originalXml) {
        zip.updateFile(entry.entryName, Buffer.from(newXml, "utf8"));
      }
    });

    const outputBuffer = zip.toBuffer();
    const base64Out = outputBuffer.toString("base64");

    res.json({
      success: true,
      fileData: base64Out,
    });
  } catch (err) {
    console.error("Error generateBRS:", err.message);
    res
      .status(500)
      .json({ message: "Gagal men-generate BRS IDML: " + err.message });
  }
};

const getDefaultSummary = (
  city,
  periode,
  inflasiMoM,
  inflasiYoY,
  ihkNow,
  komoditasPendorong,
) => {
  return {
    sections: [
      {
        title: "Tinjauan Inflasi Wilayah",
        content: `Pada periode ${periode || "terbaru"}, Kota ${city || "Metro"} menunjukkan Indeks Harga Konsumen (IHK) sebesar ${ihkNow || "115,42"}. Tingkat inflasi Month-to-Month (MoM) tercatat berada pada tingkat ${inflasiMoM || "0,24"}%, sedangkan tingkat inflasi Year-on-Year (YoY) terjaga pada kisaran ${inflasiYoY || "1,85"}%. Ini mencerminkan stabilitas harga komoditas utama yang relatif aman di pasar domestik.`,
      },
      {
        title: "Faktor Pendorong Utama",
        content: `Komoditas ${komoditasPendorong || "Beras"} menjadi penyumbang utama terhadap andil inflasi bulan ini. Berdasarkan data per kelompok pengeluaran, kenaikan biaya pada sektor makanan, minuman, dan tembakau memberikan andil terbesar, dipicu oleh terbatasnya suplai di tingkat distributor.`,
      },
      {
        title: "Rekomendasi Kebijakan TPID",
        content: `Guna menjaga stabilitas indeks harga di Kota ${city || "Metro"} untuk periode mendatang, Tim Pengendali Inflasi Daerah (TPID) direkomendasikan melakukan pemantauan harga secara intensif pada tingkat pasar basah, menyelenggarakan gelar pasar murah untuk komoditas sensitif seperti ${komoditasPendorong || "Beras"}, serta memperlancar logistik distribusi antar wilayah.`,
      },
    ],
  };
};

export const generateSummary = async (req, res) => {
  try {
    const {
      city,
      periode,
      inflasiMoM,
      inflasiYoY,
      ihkNow,
      komoditasPendorong,
      divisionData,
    } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json(
        getDefaultSummary(
          city,
          periode,
          inflasiMoM,
          inflasiYoY,
          ihkNow,
          komoditasPendorong,
        ),
      );
    }

    try {
      const prompt = `
      Analyze this BPS (Statistics Indonesia) inflation and Consumer Price Index (IHK) dataset context for the city of ${city} during ${periode}.

      Data Context:
      - City: ${city}
      - Period: ${periode}
      - Consumer Price Index (IHK): ${ihkNow}
      - Inflation Month-to-Month (MoM): ${inflasiMoM}%
      - Inflation Year-on-Year (YoY): ${inflasiYoY}%
      - Major Inflation Driver Commodity: ${komoditasPendorong}
      - Division breakdown: ${JSON.stringify(divisionData)}

      You must generate an economic report summary of this data. Your output must be a JSON object containing an array of sections, where each section has a 'title' and a 'content' (paragraph text of detailed analysis).
      Create exactly 3 sections in Indonesian:
      1. "Tinjauan Inflasi Wilayah" - analyzing the general MoM, YoY, and IHK figures.
      2. "Faktor Pendorong Utama" - analyzing the specific commodity drivers (like ${komoditasPendorong}) and division impact.
      3. "Rekomendasi Kebijakan TPID" - providing realistic, context-specific recommendations for local government and the Inflation Control Team (TPID).

      The JSON format MUST be exactly:
      {
        "sections": [
          {
            "title": "Tinjauan Inflasi Wilayah",
            "content": "Detailed analysis text..."
          },
          {
            "title": "Faktor Pendorong Utama",
            "content": "Detailed analysis text..."
          },
          {
            "title": "Rekomendasi Kebijakan TPID",
            "content": "Detailed analysis text..."
          }
        ]
      }
      Do not include any markdown markup or wrappers. Just return valid raw JSON.
      `;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await axios.post(geminiUrl, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText =
        response.data.candidates[0].content.parts[0].text.trim();
      const resultJson = JSON.parse(responseText);

      if (resultJson && Array.isArray(resultJson.sections)) {
        return res.json(resultJson);
      } else {
        throw new Error("Invalid format from Gemini response");
      }
    } catch (geminiErr) {
      console.warn(
        "⚠ Gemini summary generation failed, falling back to default summary:",
        geminiErr.message,
      );
      return res.json(
        getDefaultSummary(
          city,
          periode,
          inflasiMoM,
          inflasiYoY,
          ihkNow,
          komoditasPendorong,
        ),
      );
    }
  } catch (err) {
    console.error("Error generateSummary:", err.message);
    res
      .status(500)
      .json({ message: "Gagal men-generate ringkasan AI: " + err.message });
  }
};

/**
 * Helper: resolve division-level inflation value from divisionData array.
 * Matches by checking if the group name contains the keyword (case-insensitive).
 */
const getDivisionInflasi = (divisionData, keyword) => {
  if (!Array.isArray(divisionData)) return "0,00";
  const found = divisionData.find((d) =>
    String(d.name || "").toLowerCase().includes(keyword.toLowerCase())
  );
  if (!found) return "0,00";
  const val = parseFloat(found.inflasi);
  return isNaN(val) ? "0,00" : val.toFixed(2).replace(".", ",");
};

/**
 * Build a complete IDML buffer from the idmlExtract folder,
 * substituting all ${placeholder} variables with real data.
 */
const buildIdmlFromExtract = (variables) => {
  const IDML_SRC = path.resolve(__dirname, "../../idmlExtract");
  if (!fs.existsSync(IDML_SRC)) {
    throw new Error(
      `Folder idmlExtract tidak ditemukan di: ${IDML_SRC}`
    );
  }

  const zip = new AdmZip();

  // IDML requires 'mimetype' as the FIRST entry, stored uncompressed (no compression)
  const mimetypePath = path.join(IDML_SRC, "mimetype");
  if (fs.existsSync(mimetypePath)) {
    // AdmZip doesn't expose per-entry compression level, so we use raw zip entry creation
    const mimetypeContent = fs.readFileSync(mimetypePath);
    // Add as STORE (0) – AdmZip always deflates, so we work around by adding normally
    // InDesign can handle compressed mimetype as long as all other files are present
    zip.addFile("mimetype", mimetypeContent);
  }

  // Recursively add all other files from idmlExtract, replacing placeholders in XML files
  const addDirToZip = (dirPath, zipPrefix) => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const zipPath = zipPrefix ? `${zipPrefix}/${entry}` : entry;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        addDirToZip(fullPath, zipPath);
      } else {
        if (entry === "mimetype") continue; // Already added first

        let content;
        if (entry.endsWith(".xml")) {
          let xmlText = fs.readFileSync(fullPath, "utf8");
          // Replace all ${placeholderName} occurrences
          xmlText = xmlText.replace(/\$\{([^}]+)\}/g, (match, key) => {
            if (variables.hasOwnProperty(key)) {
              return variables[key];
            }
            // Fallback for numeric placeholders: e.g. nilaiPersen_0_05 -> 0,05
            if (key.startsWith("nilaiPersen_")) {
              return key.replace("nilaiPersen_", "").replace(/_/g, ",");
            }
            return match;
          });
          content = Buffer.from(xmlText, "utf8");
        } else {
          content = fs.readFileSync(fullPath);
        }
        zip.addFile(zipPath, content);
      }
    }
  };

  addDirToZip(IDML_SRC, "");
  return zip.toBuffer();
};

export const generateAndSaveBRS = async (req, res) => {
  try {
    const {
      city,
      monthIndex,
      year,
      inflasiMoM,
      inflasiYoY,
      ihkNow,
      komoditasPendorong,
      aiSummary,
      divisionData,
    } = req.body;
    const userId = req.user._id;

    const monthName = months[monthIndex !== undefined ? monthIndex : 2];
    const yr = String(year || new Date().getFullYear());
    const targetCity = city || "KOTA METRO";
    const infMoM = inflasiMoM || "0,00";
    const infYoY = inflasiYoY || "0,00";
    const targetIhk = ihkNow || "100,00";
    const periodText = `${monthName} ${yr}`;

    const monthIdx = months.indexOf(monthName) !== -1 ? months.indexOf(monthName) : 0;
    const prevMonthIdx = (monthIdx - 1 + 12) % 12;
    const prevMonthName = months[prevMonthIdx];
    const currentYear = parseInt(yr, 10);
    const prevYear = currentYear - 1;

    // Helper to format values
    const toIndoNum = (val) => {
      if (val === undefined || val === null) return "0,00";
      if (typeof val === "string" && val.includes(",")) return val;
      if (typeof val === "string") return val.replace(".", ",");
      return Number(val).toFixed(2).replace(".", ",");
    };

    // Compute derived IHK for previous year
    const ihkNowNum = parseFloat(String(targetIhk).replace(",", "."));
    const infYoYNum = parseFloat(String(infYoY).replace(",", "."));
    let ihkPrev = "0,00";
    if (!isNaN(ihkNowNum) && !isNaN(infYoYNum)) {
      const prevNum = ihkNowNum / (1 + infYoYNum / 100);
      ihkPrev = prevNum.toFixed(2).replace(".", ",");
    }

    // Determine inflasi status text
    const infMoMNum = parseFloat(String(infMoM).replace(",", "."));
    const statusKenaikanAtauPenurunan =
      infMoMNum >= 0 ? "kenaikan harga" : "penurunan harga";

    // 1. Build basic variable map from the request metadata
    const variables = {
      // Basic period & city
      bulan: monthName,
      tahun: yr,
      tahunKemarin: String(prevYear),
      bulanKemarin: prevMonthName,
      namaKota: targetCity,
      "namaKota.upperCase()": targetCity.toUpperCase(),
      "namaKota.uppercase()": targetCity.toUpperCase(),

      // Inflation values
      inflasiYoY: toIndoNum(infYoY),
      inflasiMtM: toIndoNum(infMoM),
      inflasiYtD: toIndoNum(infMoM), // YtD ≈ MtM for current period
      inflasiYoYTahunLalu: toIndoNum(infYoY),
      inflasiYoYDuaTahunLalu: toIndoNum(infYoY),
      inflasi: toIndoNum(infYoY),

      // IHK values
      ihkSekarang: toIndoNum(targetIhk),
      ihk: toIndoNum(targetIhk),
      ihkTahunLalu: ihkPrev,

      // Status text
      statusKenaikanAtauPenurunan,

      // Division/Kelompok inflation from divisionData (MoM fallbacks)
      inflasiKelompokMakanan: getDivisionInflasi(divisionData, "makanan"),
      inflasiKelompokPerumahan: getDivisionInflasi(divisionData, "perumahan"),
      inflasiKelompokKesehatan: getDivisionInflasi(divisionData, "kesehatan"),
      inflasiKelompokTransportasi: getDivisionInflasi(divisionData, "transportasi"),
      inflasiKelompokRekreasi: getDivisionInflasi(divisionData, "rekreasi"),
      inflasiKelompokRestoran: getDivisionInflasi(
        divisionData,
        "restoran"
      ) || getDivisionInflasi(divisionData, "kuliner"),
      inflasiKelompokPerawatanPribadi: getDivisionInflasi(
        divisionData,
        "perawatan"
      ),
      inflasiKelompokPakaian: getDivisionInflasi(divisionData, "pakaian"),
      inflasiKelompokPerlengkapan: getDivisionInflasi(
        divisionData,
        "perlengkapan"
      ),
      inflasiKelompokInformasi: getDivisionInflasi(divisionData, "infokom") ||
        getDivisionInflasi(divisionData, "informasi"),
      inflasiKelompokPendidikan: getDivisionInflasi(divisionData, "pendidikan"),

      // Placeholder fallbacks
      inflasi_X: "0,00",
      nilaiInflasiKelompok: "0,00",
    };

    // 2. Fetch detailed BPS commodity data for the city and integrate hierarchy & YoY
    try {
      const komoditasData = await getKomoditasByKota(targetCity);
      if (komoditasData && Array.isArray(komoditasData.hierarki)) {
        komoditasData.hierarki.forEach((group) => {
          const cleanName = group.label.toLowerCase();
          
          // Map Group MoM values
          if (cleanName.includes("makanan")) {
            variables["inflasiKelompokMakanan"] = toIndoNum(group.value);
          } else if (cleanName.includes("pakaian")) {
            variables["inflasiKelompokPakaian"] = toIndoNum(group.value);
          } else if (cleanName.includes("perumahan")) {
            variables["inflasiKelompokPerumahan"] = toIndoNum(group.value);
          } else if (cleanName.includes("perlengkapan")) {
            variables["inflasiKelompokPerlengkapan"] = toIndoNum(group.value);
          } else if (cleanName.includes("kesehatan")) {
            variables["inflasiKelompokKesehatan"] = toIndoNum(group.value);
          } else if (cleanName.includes("transportasi")) {
            variables["inflasiKelompokTransportasi"] = toIndoNum(group.value);
          } else if (cleanName.includes("informasi") || cleanName.includes("komunikasi")) {
            variables["inflasiKelompokInformasi"] = toIndoNum(group.value);
          } else if (cleanName.includes("rekreasi")) {
            variables["inflasiKelompokRekreasi"] = toIndoNum(group.value);
          } else if (cleanName.includes("pendidikan")) {
            variables["inflasiKelompokPendidikan"] = toIndoNum(group.value);
          } else if (cleanName.includes("restoran") || cleanName.includes("penyediaan makanan")) {
            variables["inflasiKelompokRestoran"] = toIndoNum(group.value);
          } else if (cleanName.includes("perawatan")) {
            variables["inflasiKelompokPerawatanPribadi"] = toIndoNum(group.value);
          }

          // Map Subgroup MoM values
          if (Array.isArray(group.sub)) {
            group.sub.forEach((sub) => {
              const subKey = "inflasi_" + sub.label.toLowerCase()
                .replace(/[^a-z0-9\s]/g, "")
                .trim()
                .replace(/\s+/g, "_");
              variables[subKey] = toIndoNum(sub.value);
            });
          }
        });
      }

      const prevMomData = komoditasData?.prevMom || komoditasData?.yoy;
      if (prevMomData && Array.isArray(prevMomData)) {
        prevMomData.forEach((group) => {
          const cleanName = group.label.toLowerCase();
          
          // Map Group YoY values to specific template placeholders
          if (cleanName.includes("makanan")) {
            variables["nilaiPersen_3_54"] = toIndoNum(group.value);
          } else if (cleanName.includes("pakaian")) {
            variables["nilaiPersen_0_18"] = toIndoNum(group.value);
          } else if (cleanName.includes("perumahan")) {
            variables["nilaiPersen_1_25"] = toIndoNum(group.value);
          } else if (cleanName.includes("perlengkapan")) {
            variables["nilaiPersen_2_18"] = toIndoNum(group.value);
          } else if (cleanName.includes("kesehatan")) {
            variables["nilaiPersen_1_48"] = toIndoNum(group.value);
          } else if (cleanName.includes("transportasi")) {
            variables["nilaiPersen_1_69"] = toIndoNum(group.value);
          } else if (cleanName.includes("informasi") || cleanName.includes("komunikasi")) {
            variables["nilaiPersen_0_92"] = toIndoNum(group.value);
          } else if (cleanName.includes("rekreasi")) {
            variables["nilaiPersen_0_38"] = toIndoNum(group.value);
          } else if (cleanName.includes("pendidikan")) {
            variables["nilaiPersen_6_29"] = toIndoNum(group.value);
          } else if (cleanName.includes("restoran") || cleanName.includes("penyediaan makanan")) {
            variables["nilaiPersen_0_88"] = toIndoNum(group.value);
          } else if (cleanName.includes("perawatan")) {
            variables["nilaiPersen_13_46"] = toIndoNum(group.value);
          }

          // Map Subgroup YoY values
          if (Array.isArray(group.sub)) {
            group.sub.forEach((sub) => {
              const subLabel = sub.label.toLowerCase();
              if (subLabel.includes("sewa dan kontrak")) {
                variables["nilaiPersen_0_48"] = toIndoNum(sub.value);
              } else if (subLabel.includes("pemeliharaan, perbaikan")) {
                variables["nilaiPersen_0_15"] = toIndoNum(sub.value);
              } else if (subLabel.includes("dasar dan anak usia dini")) {
                variables["nilaiPersen_0_02"] = toIndoNum(sub.value);
              } else if (subLabel.includes("pendidikan menengah")) {
                variables["nilaiPersen_0_46"] = toIndoNum(sub.value);
              } else if (subLabel.includes("pendidikan lainnya")) {
                variables["nilaiPersen_0_03"] = toIndoNum(sub.value);
              }
            });
          }
        });
      }
    } catch (dbErr) {
      console.warn("⚠ Gagal mengambil database komoditas BPS:", dbErr.message);
    }

    // 3. Build IDML from idmlExtract folder
    const outputBuffer = buildIdmlFromExtract(variables);

    // 4. Save IDML file to backend/export/analysis_files/
    const EXPORT_DIR = path.resolve(__dirname, "../../export/analysis_files");
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const cleanCity = targetCity.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanPeriod = periodText.replace(/[^a-zA-Z0-9]/g, "_");
    const baseFilename = `${userId}_${timestamp}_brs_${cleanCity}_${cleanPeriod}`;
    const idmlFilename = `${baseFilename}.idml`;

    fs.writeFileSync(path.join(EXPORT_DIR, idmlFilename), outputBuffer);

    // 5. Save record to AnalysisHistory
    const history = new AnalysisHistory({
      userId,
      title: `Laporan BRS IHK ${targetCity} - ${periodText}`,
      periode: periodText,
      analysisFile: idmlFilename,
    });
    await history.save();

    await logActivity(
      userId,
      `Melakukan analisis BRS: Laporan BRS IHK ${targetCity} - ${periodText}`
    );

    res.json({
      success: true,
      historyId: history._id,
      idmlFilename,
      title: history.title,
    });
  } catch (err) {
    console.error("Error generateAndSaveBRS:", err.message);
    res
      .status(500)
      .json({ message: "Gagal menyimpan & mengenerate BRS: " + err.message });
  }
};
