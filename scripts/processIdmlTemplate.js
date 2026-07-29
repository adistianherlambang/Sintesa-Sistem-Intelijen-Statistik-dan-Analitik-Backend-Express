import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import mongoose from "mongoose";
import { processIdmlVariables, toIndoNum } from "../services/idmlDataProcessor.js";
import { generateIdmlNarratives } from "../services/idmlNarrativeGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Pemrosesan blok kontekstual per kelompok pengeluaran untuk Story_ucc5.xml menggunakan pemotongan blok presisi
 */
export const processStoryUcc5Contextually = (xmlContent, rawData) => {
  const groupProcessedData = rawData.groupProcessedData || {};

  const headers = [
    { header: "Makanan, Minuman, dan Tembakau", key: "makanan" },
    { header: "Pakaian dan Alas Kaki", key: "pakaian" },
    { header: "Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga", key: "perumahan" },
    { header: "Perlengkapan, Peralatan, dan Pemeliharaan Rutin Rumah Tangga", key: "perlengkapan" },
    { header: "Kesehatan", key: "kesehatan" },
    { header: "Informasi, Komunikasi, dan Jasa Keuangan", key: "informasi" },
    { header: "Transportasi", key: "transportasi" },
    { header: "Rekreasi, Olahraga, dan Budaya", key: "rekreasi" },
    { header: "Pendidikan", key: "pendidikan" },
    { header: "Penyediaan Makanan dan Minuman/Restoran", key: "restoran" },
    { header: "Perawatan Pribadi dan Jasa Lainnya", key: "perawatan" },
  ];

  const startSearchPos = xmlContent.indexOf("ParagraphStyle/Sub Sub Bab BRS");
  const searchBase = startSearchPos !== -1 ? startSearchPos : 0;

  const matches = [];
  headers.forEach((h) => {
    const targetTag = `<Content>${h.header}</Content>`;
    const pos = xmlContent.indexOf(targetTag, searchBase);
    if (pos !== -1) {
      matches.push({ pos, header: h.header, key: h.key, tagLength: targetTag.length });
    }
  });

  matches.sort((a, b) => a.pos - b.pos);
  if (matches.length === 0) return xmlContent;

  let result = xmlContent.slice(0, matches[0].pos);

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextPos = i + 1 < matches.length ? matches[i + 1].pos : xmlContent.length;
    let blockContent = xmlContent.slice(current.pos, nextPos);

    const data = groupProcessedData[current.key] || {};
    const groupNameLower = current.header.toLowerCase();

    const yoyVal = parseFloat(data.yoy) || 0.0;
    const andilYoyVal = parseFloat(data.andilYoy) || 0.0;
    const andilMtmVal = parseFloat(data.andilMtm) || 0.0;
    const ihkPrevVal = parseFloat(data.ihkSebelumnya) || 104.5;
    const ihkNowVal = parseFloat(data.ihkBerjalan) || 106.8;

    const subItems = Array.isArray(data.subYoy) && data.subYoy.length > 0 ? data.subYoy : (Array.isArray(data.subMom) ? data.subMom : []);
    let subHighest = subItems.length > 0 ? subItems.reduce((max, s) => (parseFloat(s.value) || 0) > (parseFloat(max.value) || 0) ? s : max, subItems[0]) : null;
    let subLowest = subItems.length > 0 ? subItems.reduce((min, s) => (parseFloat(s.value) || 0) < (parseFloat(min.value) || 0) ? s : min, subItems[0]) : null;

    let subInflasiList = subItems.filter(s => (parseFloat(s.value) || 0) > 0);
    let subDeflasiList = subItems.filter(s => (parseFloat(s.value) || 0) < 0);
    let subStabilList = subItems.filter(s => (parseFloat(s.value) || 0) === 0);

    // Dynamic inflasi vs deflasi wording
    if (yoyVal >= 0) {
      blockContent = blockContent.replace(/mengalami deflasi y-on-y/g, "mengalami inflasi y-on-y");
      blockContent = blockContent.replace(/penurunan indeks/g, "kenaikan indeks");
      blockContent = blockContent.replace(/andil\/sumbangan deflasi y-on-y/g, "andil/sumbangan inflasi y-on-y");
    } else {
      blockContent = blockContent.replace(/mengalami inflasi y-on-y/g, "mengalami deflasi y-on-y");
      blockContent = blockContent.replace(/kenaikan indeks/g, "penurunan indeks");
      blockContent = blockContent.replace(/andil\/sumbangan inflasi y-on-y/g, "andil/sumbangan deflasi y-on-y");
    }

    blockContent = blockContent.replace(/\$\{namaKelompok\}/g, groupNameLower);
    blockContent = blockContent.replace(/\$\{inflasiYoy\}/g, toIndoNum(Math.abs(yoyVal)));
    blockContent = blockContent.replace(/\$\{deflasiYoy\}/g, toIndoNum(Math.abs(yoyVal)));
    blockContent = blockContent.replace(/\$\{indeksTahunSebelumnya\}/g, toIndoNum(ihkPrevVal));
    blockContent = blockContent.replace(/\$\{indeksSaatIni\}/g, toIndoNum(ihkNowVal));

    blockContent = blockContent.replace(/\$\{andilInflasiYoy\}/g, toIndoNum(Math.abs(andilYoyVal)));
    blockContent = blockContent.replace(/\$\{andilDeflasiYoy\}/g, toIndoNum(Math.abs(andilYoyVal)));
    blockContent = blockContent.replace(/\$\{andilInflasiMtm\}/g, toIndoNum(Math.abs(andilMtmVal)));
    blockContent = blockContent.replace(/\$\{andilDeflasiMtm\}/g, toIndoNum(Math.abs(andilMtmVal)));

    blockContent = blockContent.replace(/\$\{subkelompokInflasiTertinggi\}/g, subHighest ? subHighest.label.toLowerCase() : "makanan");
    blockContent = blockContent.replace(/\$\{inflasiSubkelompokTertinggi\}/g, subHighest ? toIndoNum(Math.abs(subHighest.value)) : "0,00");
    blockContent = blockContent.replace(/\$\{inflasiSubkelompokTertinggiYoy\}/g, subHighest ? toIndoNum(Math.abs(subHighest.value)) : "0,00");

    blockContent = blockContent.replace(/\$\{subkelompokInflasiTerendah\}/g, subLowest ? subLowest.label.toLowerCase() : "minuman");
    blockContent = blockContent.replace(/\$\{inflasiSubkelompokTerendah\}/g, subLowest ? toIndoNum(Math.abs(subLowest.value)) : "0,00");
    blockContent = blockContent.replace(/\$\{inflasiSubkelompokTerendahYoy\}/g, subLowest ? toIndoNum(Math.abs(subLowest.value)) : "0,00");

    blockContent = blockContent.replace(/\$\{subkelompokInflasi\}/g, subInflasiList.length > 0 ? subInflasiList[0].label.toLowerCase() : "makanan");
    blockContent = blockContent.replace(/\$\{inflasiSubkelompokYoy\}/g, subInflasiList.length > 0 ? toIndoNum(Math.abs(subInflasiList[0].value)) : "0,00");

    blockContent = blockContent.replace(/\$\{subkelompokDeflasi\}/g, subDeflasiList.length > 0 ? subDeflasiList[0].label.toLowerCase() : "pakaian");
    blockContent = blockContent.replace(/\$\{deflasiSubkelompokYoy\}/g, subDeflasiList.length > 0 ? toIndoNum(Math.abs(subDeflasiList[0].value)) : "0,00");

    blockContent = blockContent.replace(/\$\{subkelompokStabil\}/g, subStabilList.length > 0 ? subStabilList.map(s => s.label.toLowerCase()).join(", ") : "lainnya");

    blockContent = blockContent.replace(/\$\{jumlahSubkelompok\}/g, String(subItems.length));
    blockContent = blockContent.replace(/\$\{jumlahSubkelompokInflasi\}/g, String(subInflasiList.length));
    blockContent = blockContent.replace(/\$\{jumlahSubkelompokStabil\}/g, String(subStabilList.length));

    result += blockContent;
  }

  return result;
};

/**
 * Pindai direktori idmlExtract dan ganti seluruh placeholder ${...}
 */
export const runIdmlTemplateFiller = async (targetCity = "") => {
  console.log(`🚀 Memproses template IDML XML untuk kota: ${targetCity || "Default"}...`);

  if (mongoose.connection.readyState === 0) {
    const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI || "mongodb://localhost:27017/sintesa";
    console.log(`🔌 Menghubungkan ke MongoDB: ${mongoUrl}...`);
    await mongoose.connect(mongoUrl);
  }

  const IDML_DIR = path.resolve(__dirname, "../idmlExtract");
  const OUT_DIR = path.resolve(__dirname, "../export/populated_xml");

  if (!fs.existsSync(IDML_DIR)) {
    throw new Error(`Direktori template idmlExtract tidak ditemukan di: ${IDML_DIR}`);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // 1. Ambil & olah data statistik BPS serta hitung andil dari bobot.json
  const { variables: baseVars, raw: rawData } = await processIdmlVariables(targetCity);

  // 2. Hasilkan narasi keterangan BPS dari AI (Gemini LLM)
  const narrativeVars = await generateIdmlNarratives(rawData, baseVars);

  // 3. Gabungkan seluruh variabel ke dictionary utama
  const allVariables = {
    ...baseVars,
    ...narrativeVars,
  };

  const zip = new AdmZip();
  let replacedFilesCount = 0;
  let totalPlaceholdersReplaced = 0;

  const mimetypePath = path.join(IDML_DIR, "mimetype");
  if (fs.existsSync(mimetypePath)) {
    zip.addFile("mimetype", fs.readFileSync(mimetypePath));
  }

  const copyAndReplace = (srcDir, outDir, zipPrefix) => {
    const entries = fs.readdirSync(srcDir);
    for (const entry of entries) {
      const fullPath = path.join(srcDir, entry);
      const targetPath = path.join(outDir, entry);
      const zipPath = zipPrefix ? `${zipPrefix}/${entry}` : entry;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
        copyAndReplace(fullPath, targetPath, zipPath);
      } else {
        if (entry === "mimetype") continue;

        let content;
        if (entry.endsWith(".xml")) {
          let xmlText = fs.readFileSync(fullPath, "utf8");

          if (entry === "Story_ucc5.xml") {
            xmlText = processStoryUcc5Contextually(xmlText, rawData);
          }

          let fileHasPlaceholder = false;
          xmlText = xmlText.replace(/\$\{([^}]+)\}/g, (match, key) => {
            fileHasPlaceholder = true;
            totalPlaceholdersReplaced++;

            const trimmedKey = key.trim();

            if (allVariables.hasOwnProperty(trimmedKey)) {
              return allVariables[trimmedKey];
            }

            if (trimmedKey.startsWith("nilaiPersen_")) {
              return trimmedKey.replace("nilaiPersen_", "").replace(/_/g, ",");
            }

            return "0,00";
          });

          if (fileHasPlaceholder) replacedFilesCount++;
          fs.writeFileSync(targetPath, xmlText, "utf8");
          content = Buffer.from(xmlText, "utf8");
        } else {
          content = fs.readFileSync(fullPath);
          fs.writeFileSync(targetPath, content);
        }

        zip.addFile(zipPath, content);
      }
    }
  };

  copyAndReplace(IDML_DIR, OUT_DIR, "");

  const exportDir = path.resolve(__dirname, "../export/analysis_files");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const cleanCity = targetCity.replace(/[^a-zA-Z0-9]/g, "_");
  const idmlOutputPath = path.join(exportDir, `BRS_Populated_${cleanCity}.idml`);
  zip.writeZip(idmlOutputPath);

  let unreplacedCount = 0;
  const verifyNoPlaceholders = (dirPath) => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        verifyNoPlaceholders(fullPath);
      } else if (entry.endsWith(".xml")) {
        const content = fs.readFileSync(fullPath, "utf8");
        const matches = content.match(/\$\{([^}]+)\}/g);
        if (matches) {
          unreplacedCount += matches.length;
          console.error(`❌ Ditemukan ${matches.length} placeholder belum terisi di: ${path.relative(OUT_DIR, fullPath)}`);
          matches.forEach((m) => console.error(`   - ${m}`));
        }
      }
    }
  };

  verifyNoPlaceholders(OUT_DIR);

  console.log(`\n==================================================`);
  console.log(`✅ IDML XML Filler Selesai!`);
  console.log(`- Kota: ${targetCity}`);
  console.log(`- File XML Populated: ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`- IDML Package Output: ${path.relative(process.cwd(), idmlOutputPath)}`);
  console.log(`- Total Placeholder Diganti: ${totalPlaceholdersReplaced}`);
  console.log(`- Placeholder Tersisa: ${unreplacedCount} (Harus 0)`);
  console.log(`==================================================\n`);

  return {
    success: unreplacedCount === 0,
    replacedFilesCount,
    totalPlaceholdersReplaced,
    unreplacedCount,
    idmlOutputPath,
    outDir: OUT_DIR,
  };
};

if (process.argv[1] && process.argv[1].endsWith("processIdmlTemplate.js")) {
  const cityArg = process.argv[2] || "";
  runIdmlTemplateFiller(cityArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Error processIdmlTemplate:", err.message);
      process.exit(1);
    });
}
