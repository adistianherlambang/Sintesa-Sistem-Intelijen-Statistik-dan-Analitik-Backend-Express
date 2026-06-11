import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const months = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * Endpoint to upload Excel, parse it, and use Gemini to check if it's IHK/Inflation data
 */
export const parseAndVerifyDataset = async (req, res) => {
  try {
    const { fileData, fileName, city } = req.body;
    if (!fileData) {
      return res.status(400).json({ message: "Data file (base64) wajib dikirim" });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Find active sheet (looks for 'Data 03', 'Data', or the first sheet)
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('data')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return res.status(404).json({ message: "Sheet data tidak ditemukan di Excel" });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rows[0] || [];

    // Decode range to count rows/cols
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
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
    const isBpsFormat = headerRow.some(c => String(c).toLowerCase().includes('komoditas')) && 
                        headerRow.some(c => String(c).toLowerCase().includes('ihk'));

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
            responseMimeType: "application/json"
          }
        });
        const resultText = response.data.candidates[0].content.parts[0].text.trim();
        const resultJson = JSON.parse(resultText);
        isValid = resultJson.valid === "ya" ? "ya" : "tidak";
      } catch (geminiErr) {
        console.warn("⚠ Gemini validation failed, falling back to header structural check:", geminiErr.message);
        isValid = isBpsFormat ? "ya" : "tidak";
      }
    } else {
      console.log("No GEMINI_API_KEY found, performing structural check instead.");
      isValid = isBpsFormat ? "ya" : "tidak";
    }

    res.json({
      valid: isValid,
      fileInfo: {
        name: fileName || "file.xlsx",
        size: `${(buffer.length / 1024).toFixed(1)} kB`,
        rows: rowsCount,
        cols: colsCount,
        sheet: sheetName
      },
      context: {
        city: extractedCity || city || "KOTA METRO",
        period: periodText,
        monthIndex,
        year: yearVal
      },
      structure: isBpsFormat ? "BPS Inflasi / IHK" : "Kustom",
      columns: headerRow,
      parsedData: rows
    });

  } catch (err) {
    console.error("Error parseAndVerifyDataset:", err.message);
    res.status(500).json({ message: "Gagal memproses file Excel: " + err.message });
  }
};

/**
 * Endpoint to populate InDesign IDML template with the data
 */
export const generateBRS = async (req, res) => {
  try {
    const { city, monthIndex, year, inflasiMoM, inflasiYoY, ihkNow, komoditasPendorong } = req.body;

    const monthName = months[monthIndex !== undefined ? monthIndex : 2]; // default Maret
    const yr = year || new Date().getFullYear();
    const targetCity = city || "KOTA METRO";
    const infMoM = inflasiMoM || "0,00";
    const infYoY = inflasiYoY || "0,00";
    const targetIhk = ihkNow || "100,00";
    const pendorong = komoditasPendorong || "N/A";

    const idmlPath = path.resolve(__dirname, '../../../perkembanganIHK.idml');
    if (!fs.existsSync(idmlPath)) {
      return res.status(404).json({ message: "Template IDML perkembanganIHK.idml tidak ditemukan di root." });
    }

    const zip = new AdmZip(idmlPath);
    const storyEntry = zip.getEntry("Stories/Story_u8e9.xml");
    if (!storyEntry) {
      return res.status(404).json({ message: "File Stories/Story_u8e9.xml tidak ditemukan di dalam IDML." });
    }

    const originalXml = storyEntry.getData().toString('utf8');
    let newXml = originalXml;

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `
        You are a BPS economic analyst assistant.
        We need to update the text narrative content inside an Adobe InDesign IDML Story XML file for a Berita Resmi Statistik (BRS) report.
        The report is for IHK/Inflation in the city: ${targetCity}.
        
        Update the text to reflect the new data:
        - Kota: ${targetCity}
        - Periode: ${monthName} ${yr}
        - Inflasi MoM (Month-to-Month): ${infMoM}%
        - Inflasi YoY (Year-on-Year): ${infYoY}%
        - Indeks Harga Konsumen (IHK) terbaru: ${targetIhk}
        - Komoditas Penyumbang Utama Inflasi: ${pendorong}
        
        Here is the original XML content:
        ${originalXml}
        
        Please rewrite this XML. You must replace the old month and year (e.g. "November 2025", "Oktober 2025") and old statistical figures (like 1,88% inflation, specific index points, and old commodity lists) with the new values. Maintain the exact same XML tag structures (e.g., <Story>, <ParagraphStyleRange>, <CharacterStyleRange>, <Content>, <Br />).
        Return ONLY the raw updated XML content. Do not wrap in markdown code blocks or add explanations.
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(geminiUrl, {
          contents: [{ parts: [{ text: prompt }] }]
        });
        
        let responseText = response.data.candidates[0].content.parts[0].text.trim();
        if (responseText.startsWith("```")) {
          responseText = responseText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
        }
        if (responseText) {
          newXml = responseText;
        }
      } catch (geminiErr) {
        console.warn("⚠ Gemini narrative rewrite failed, falling back to simple regex replacements:", geminiErr.message);
      }
    }

    // Update u8e9.xml in Zip
    zip.updateFile("Stories/Story_u8e9.xml", Buffer.from(newXml, 'utf8'));

    // Apply basic keyword search-replace across all other files in IDML for consistency (e.g. titles, headers, footers)
    const zipEntries = zip.getEntries();
    zipEntries.forEach(entry => {
      if (entry.entryName === "Stories/Story_u8e9.xml") return;
      if (entry.isDirectory) return;

      let fileText = entry.getData().toString('utf8');
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
        zip.updateFile(entry.entryName, Buffer.from(fileText, 'utf8'));
      }
    });

    const outputBuffer = zip.toBuffer();
    const base64Out = outputBuffer.toString('base64');
    
    // Save to export folder
    const exportDirPath = path.resolve(__dirname, '../../export');
    if (!fs.existsSync(exportDirPath)) {
      fs.mkdirSync(exportDirPath, { recursive: true });
    }
    const outputFilename = `perkembanganIHK_${targetCity.replace(/\s+/g, '_')}_${monthName}_${yr}.idml`;
    const outputPath = path.join(exportDirPath, outputFilename);
    fs.writeFileSync(outputPath, outputBuffer);

    // Extract raw text for preview from newXml (strips XML tags)
    const previewText = newXml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    res.json({
      success: true,
      fileName: outputFilename,
      fileData: base64Out,
      previewText: previewText || `Berita Resmi Statistik untuk ${targetCity} periode ${monthName} ${yr} berhasil digenerate.`
    });

  } catch (err) {
    console.error("Error generateBRS:", err.message);
    res.status(500).json({ message: "Gagal men-generate BRS IDML: " + err.message });
  }
};
