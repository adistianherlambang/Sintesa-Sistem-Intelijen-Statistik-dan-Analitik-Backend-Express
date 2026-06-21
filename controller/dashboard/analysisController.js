import XLSX from "xlsx";
import AdmZip from "adm-zip";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";
import { logActivity } from "../user/activityController.js";

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

  // Replace City name
  newXml = newXml.replaceAll("Kota Metro", targetCity);
  newXml = newXml.replaceAll("Metro", targetCity);
  newXml = newXml.replaceAll("METRO", targetCity.toUpperCase());

  // Replace Period
  newXml = newXml.replaceAll("November 2025", `${monthName} ${yr}`);
  newXml = newXml.replaceAll("November 2024", `${monthName} ${yr - 1}`);
  newXml = newXml.replaceAll("November", monthName);

  // Replace YoY inflation (original is 1,88)
  newXml = newXml.replaceAll("1,88", infYoY);

  // Replace MoM inflation (original is 0,19)
  newXml = newXml.replaceAll("0,19", infMoM);

  // Replace IHK (original is 107,93)
  newXml = newXml.replaceAll("107,93", targetIhk);

  // Replace previous IHK (original is 105.94 or 105,94)
  const ihkNowNum = parseFloat(String(targetIhk).replace(",", "."));
  const infYoYNum = parseFloat(String(infYoY).replace(",", "."));
  let ihkPrev = "105,94";
  if (!isNaN(ihkNowNum) && !isNaN(infYoYNum)) {
    const prevNum = ihkNowNum / (1 + infYoYNum / 100);
    ihkPrev = prevNum.toFixed(2).replace(".", ",");
  }
  newXml = newXml.replaceAll("105.94", ihkPrev.replace(",", "."));
  newXml = newXml.replaceAll("105,94", ihkPrev);

  // Replace YtD inflation (original is 1,41)
  newXml = newXml.replaceAll("1,41", infMoM);

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

    const originalXml = storyEntry.getData().toString("utf8");
    const newXml = fillStoryXML(
      originalXml,
      targetCity,
      monthName,
      yr,
      infMoM,
      infYoY,
      targetIhk,
    );

    // Update u8e9.xml in Zip
    zip.updateFile("Stories/Story_u8e9.xml", Buffer.from(newXml, "utf8"));

    // Apply basic keyword search-replace across all other files in IDML for consistency (e.g. titles, headers, footers)
    const zipEntries = zip.getEntries();
    zipEntries.forEach((entry) => {
      if (entry.entryName === "Stories/Story_u8e9.xml") return;
      if (entry.isDirectory) return;

      let fileText = entry.getData().toString("utf8");
      let modified = false;

      if (fileText.includes("November 2025")) {
        fileText = fileText.replaceAll("November 2025", `${monthName} ${yr}`);
        modified = true;
      }
      if (fileText.includes("November")) {
        fileText = fileText.replaceAll("November", monthName);
        modified = true;
      }
      if (fileText.includes("Metro")) {
        fileText = fileText.replaceAll("Metro", targetCity);
        modified = true;
      }
      if (fileText.includes("METRO")) {
        fileText = fileText.replaceAll("METRO", targetCity.toUpperCase());
        modified = true;
      }

      if (modified) {
        zip.updateFile(entry.entryName, Buffer.from(fileText, "utf8"));
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
    const yr = year || new Date().getFullYear();
    const targetCity = city || "KOTA METRO";
    const infMoM = inflasiMoM || "0,00";
    const infYoY = inflasiYoY || "0,00";
    const targetIhk = ihkNow || "100,00";
    const periodText = `${monthName} ${yr}`;

    // 1. Generate modified IDML using Zip
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

    const originalXml = storyEntry.getData().toString("utf8");
    const newXml = fillStoryXML(
      originalXml,
      targetCity,
      monthName,
      yr,
      infMoM,
      infYoY,
      targetIhk,
    );

    zip.updateFile("Stories/Story_u8e9.xml", Buffer.from(newXml, "utf8"));

    const zipEntries = zip.getEntries();
    zipEntries.forEach((entry) => {
      if (entry.entryName === "Stories/Story_u8e9.xml") return;
      if (entry.isDirectory) return;

      let fileText = entry.getData().toString("utf8");
      let modified = false;

      if (fileText.includes("November 2025")) {
        fileText = fileText.replaceAll("November 2025", `${monthName} ${yr}`);
        modified = true;
      }
      if (fileText.includes("November")) {
        fileText = fileText.replaceAll("November", monthName);
        modified = true;
      }
      if (fileText.includes("Metro")) {
        fileText = fileText.replaceAll("Metro", targetCity);
        modified = true;
      }
      if (fileText.includes("METRO")) {
        fileText = fileText.replaceAll("METRO", targetCity.toUpperCase());
        modified = true;
      }

      if (modified) {
        zip.updateFile(entry.entryName, Buffer.from(fileText, "utf8"));
      }
    });

    const outputBuffer = zip.toBuffer();

    // 2. Save IDML file to backend/export/analysis_files/
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

    // 3. Save record to AnalysisHistory
    const history = new AnalysisHistory({
      userId,
      title: `Laporan BRS IHK ${targetCity} - ${periodText}`,
      periode: periodText,
      analysisFile: idmlFilename,
    });
    await history.save();

    await logActivity(userId, `Melakukan analisis BRS: Laporan BRS IHK ${targetCity} - ${periodText}`);

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
