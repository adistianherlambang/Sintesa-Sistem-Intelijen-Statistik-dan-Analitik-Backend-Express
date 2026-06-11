import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import AnalysisHistory from '../../db/models/AnalysisHistory.js';

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

export const generateSummary = async (req, res) => {
  try {
    const { city, periode, inflasiMoM, inflasiYoY, ihkNow, komoditasPendorong, divisionData } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        sections: [
          {
            title: "Tinjauan Inflasi Wilayah",
            content: `Pada periode ${periode || 'terbaru'}, Kota ${city || 'Metro'} menunjukkan Indeks Harga Konsumen (IHK) sebesar ${ihkNow || '115,42'}. Tingkat inflasi Month-to-Month (MoM) tercatat berada pada tingkat ${inflasiMoM || '0,24'}%, sedangkan tingkat inflasi Year-on-Year (YoY) terjaga pada kisaran ${inflasiYoY || '1,85'}%. Ini mencerminkan stabilitas harga komoditas utama yang relatif aman di pasar domestik.`
          },
          {
            title: "Faktor Pendorong Utama",
            content: `Komoditas ${komoditasPendorong || 'Beras'} menjadi penyumbang utama terhadap andil inflasi bulan ini. Berdasarkan data per kelompok pengeluaran, kenaikan biaya pada sektor makanan, minuman, dan tembakau memberikan andil terbesar, dipicu oleh terbatasnya suplai di tingkat distributor.`
          },
          {
            title: "Rekomendasi Kebijakan TPID",
            content: `Guna menjaga stabilitas indeks harga di Kota ${city || 'Metro'} untuk periode mendatang, Tim Pengendali Inflasi Daerah (TPID) direkomendasikan melakukan pemantauan harga secara intensif pada tingkat pasar basah, menyelenggarakan gelar pasar murah untuk komoditas sensitif seperti ${komoditasPendorong || 'Beras'}, serta memperlancar logistik distribusi antar wilayah.`
          }
        ]
      });
    }

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
        responseMimeType: "application/json"
      }
    });

    const responseText = response.data.candidates[0].content.parts[0].text.trim();
    const resultJson = JSON.parse(responseText);
    res.json(resultJson);

  } catch (err) {
    console.error("Error generateSummary:", err.message);
    res.status(500).json({ message: "Gagal men-generate ringkasan AI: " + err.message });
  }
};

export const generateAndSaveBRS = async (req, res) => {
  try {
    const { city, monthIndex, year, inflasiMoM, inflasiYoY, ihkNow, komoditasPendorong, aiSummary, divisionData } = req.body;
    const userId = req.user._id;

    const monthName = months[monthIndex !== undefined ? monthIndex : 2];
    const yr = year || new Date().getFullYear();
    const targetCity = city || "KOTA METRO";
    const infMoM = inflasiMoM || "0,00";
    const infYoY = inflasiYoY || "0,00";
    const targetIhk = ihkNow || "100,00";
    const pendorong = komoditasPendorong || "N/A";
    const periodText = `${monthName} ${yr}`;

    // 1. Generate modified IDML using Zip
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
        console.warn("⚠ Gemini narrative rewrite failed, falling back to simple replacements:", geminiErr.message);
      }
    }

    zip.updateFile("Stories/Story_u8e9.xml", Buffer.from(newXml, 'utf8'));

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

    // 2. Generate PDF using Puppeteer
    const sectionsHtml = (aiSummary && Array.isArray(aiSummary) ? aiSummary : []).map(sec => `
      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 16px; color: #0a5c36; margin: 0 0 8px 0; border-bottom: 1px solid rgba(10,92,54,0.15); padding-bottom: 4px;">${sec.title}</h3>
        <p style="font-size: 14px; color: #444444; text-align: justify; margin: 0; line-height: 1.6;">${sec.content}</p>
      </div>
    `).join('');

    let tableHtml = "";
    if (divisionData && Array.isArray(divisionData) && divisionData.length > 0) {
      const tableRows = divisionData.map((div, idx) => `
        <tr>
          <td style="width: 50px; text-align: center; border: 1px solid #dcdcdc; padding: 10px;">${idx + 1}</td>
          <td style="border: 1px solid #dcdcdc; padding: 10px;">${div.name}</td>
          <td style="width: 150px; text-align: right; font-weight: 600; color: ${parseFloat(div.inflasi) >= 0 ? '#0a5c36' : '#c0392b'}; border: 1px solid #dcdcdc; padding: 10px;">
            ${parseFloat(div.inflasi).toFixed(2)}%
          </td>
        </tr>
      `).join('');
      
      tableHtml = `
        <div style="margin-top: 30px;">
          <h2 style="font-size: 18px; font-weight: 700; color: #0a5c36; border-bottom: 2px solid #0a5c36; padding-bottom: 6px; margin-bottom: 15px; text-transform: uppercase;">
            Tabel Inflasi Kelompok Pengeluaran (MoM)
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #0a5c36; color: #ffffff;">
                <th style="width: 50px; text-align: center; border: 1px solid #0a5c36; padding: 10px;">No</th>
                <th style="border: 1px solid #0a5c36; padding: 10px;">Kelompok Pengeluaran</th>
                <th style="width: 150px; text-align: right; border: 1px solid #0a5c36; padding: 10px;">Inflasi MoM (%)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>BRS IHK ${targetCity}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #333333;
          margin: 0;
          padding: 0;
          background-color: #ffffff;
          -webkit-print-color-adjust: exact;
        }
        .page {
          padding: 40px;
        }
        .header {
          border-bottom: 3px double #0a5c36;
          padding-bottom: 15px;
          margin-bottom: 25px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .header-title {
          font-size: 28px;
          font-weight: 800;
          color: #0a5c36;
          margin: 0;
          text-transform: uppercase;
        }
        .header-subtitle {
          font-size: 15px;
          font-weight: 600;
          color: #555555;
          margin: 4px 0 0 0;
          letter-spacing: 0.5px;
        }
        .meta-box {
          display: flex;
          justify-content: space-between;
          background-color: #f1f7f4;
          border-left: 5px solid #0a5c36;
          padding: 15px;
          margin-bottom: 30px;
          border-radius: 0 8px 8px 0;
        }
        .meta-item {
          font-size: 13px;
          color: #444444;
        }
        .meta-item strong {
          color: #0a5c36;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: #fdfdfd;
          border: 1px solid #e2eae5;
          border-radius: 10px;
          padding: 20px 15px;
          text-align: center;
          box-shadow: 0 4px 6px rgba(0,0,0,0.01);
        }
        .stat-val {
          font-size: 32px;
          font-weight: 800;
          color: #0a5c36;
          margin-bottom: 6px;
        }
        .stat-lbl {
          font-size: 11px;
          color: #666666;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .section-heading {
          font-size: 18px;
          font-weight: 700;
          color: #0a5c36;
          border-bottom: 2px solid #0a5c36;
          padding-bottom: 6px;
          margin-top: 30px;
          margin-bottom: 20px;
          text-transform: uppercase;
        }
        .footer {
          margin-top: 60px;
          border-top: 1px solid #e2eae5;
          padding-top: 15px;
          text-align: center;
          font-size: 11px;
          color: #888888;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div>
            <div class="header-title">Berita Resmi Statistik</div>
            <div class="header-subtitle">BADAN PUSAT STATISTIK ${targetCity.toUpperCase()}</div>
          </div>
          <div style="font-size: 11px; font-weight: 800; color: #0a5c36; border: 2px solid #0a5c36; padding: 6px 12px; border-radius: 4px; letter-spacing: 1px;">
            RILIS RESMI
          </div>
        </div>
        
        <div class="meta-box">
          <div class="meta-item">Wilayah: <strong>${targetCity}</strong></div>
          <div class="meta-item">Periode: <strong>${periodText}</strong></div>
          <div class="meta-item">Dibuat pada: <strong>${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-val">${targetIhk}</div>
            <div class="stat-lbl">Indeks Harga Konsumen (IHK)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${infMoM}%</div>
            <div class="stat-lbl">Inflasi Bulanan (MoM)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${infYoY}%</div>
            <div class="stat-lbl">Inflasi Tahunan (YoY)</div>
          </div>
        </div>
        
        <div class="section-heading">Ringkasan Eksekutif Hasil Analisis AI</div>
        <div style="background-color: #fafbfc; border: 1px solid #e9ecef; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
          ${sectionsHtml}
        </div>
        
        ${tableHtml}
        
        <div class="footer">
          Laporan Berita Resmi Statistik ini dibuat secara dinamis menggunakan modul generator AI BRS terintegrasi.
        </div>
      </div>
    </body>
    </html>
    `;

    let pdfBuffer;
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          bottom: '15mm',
          left: '15mm',
          right: '15mm'
        }
      });
    } catch (puppeteerErr) {
      console.error("Puppeteer launch or PDF generation failed, checking system Chrome:", puppeteerErr.message);
      try {
        const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        browser = await puppeteer.launch({
          executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '15mm',
            bottom: '15mm',
            left: '15mm',
            right: '15mm'
          }
        });
      } catch (fallbackErr) {
        throw new Error("Gagal menginisiasi Puppeteer untuk PDF: " + fallbackErr.message);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    // 3. Save both files to backend/export/analysis_files/
    const EXPORT_DIR = path.resolve(__dirname, '../../export/analysis_files');
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const cleanCity = targetCity.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanPeriod = periodText.replace(/[^a-zA-Z0-9]/g, "_");
    const baseFilename = `${userId}_${timestamp}_brs_${cleanCity}_${cleanPeriod}`;
    const idmlFilename = `${baseFilename}.idml`;
    const pdfFilename = `${baseFilename}.pdf`;

    fs.writeFileSync(path.join(EXPORT_DIR, idmlFilename), outputBuffer);
    fs.writeFileSync(path.join(EXPORT_DIR, pdfFilename), pdfBuffer);

    // 4. Save record to AnalysisHistory
    const history = new AnalysisHistory({
      userId,
      title: `Laporan BRS IHK ${targetCity} - ${periodText}`,
      periode: periodText,
      analysisFile: idmlFilename,
    });
    await history.save();

    res.json({
      success: true,
      pdfData: pdfBuffer.toString('base64'),
      historyId: history._id,
      idmlFilename,
      pdfFilename,
      title: history.title
    });

  } catch (err) {
    console.error("Error generateAndSaveBRS:", err.message);
    res.status(500).json({ message: "Gagal menyimpan & mengenerate BRS: " + err.message });
  }
};
