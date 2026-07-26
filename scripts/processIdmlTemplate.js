import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import { processIdmlVariables, toIndoNum } from "../services/idmlDataProcessor.js";
import { generateIdmlNarratives } from "../services/idmlNarrativeGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Pemrosesan blok kontekstual per kelompok pengeluaran untuk Story_ucc5.xml
 */
export const processStoryUcc5Contextually = (xmlContent, rawData) => {
  const groupProcessedData = rawData.groupProcessedData || {};

  const groupSections = [
    { header: "Makanan, Minuman, dan Tembakau", key: "makanan" },
    { header: "Pakaian dan Alas Kaki", key: "pakaian" },
    { header: "Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga", key: "perumahan" },
    { header: "Perlengkapan, Peralatan, dan Pemeliharaan Rutin Rumah Tangga", key: "perlengkapan" },
    { header: "Kesehatan", key: "kesehatan" },
    { header: "Transportasi", key: "transportasi" },
    { header: "Informasi, Komunikasi, dan Jasa Keuangan", key: "informasi" },
    { header: "Rekreasi, Olahraga, dan Budaya", key: "rekreasi" },
    { header: "Pendidikan", key: "pendidikan" },
    { header: "Penyediaan Makanan dan Minuman/Restoran", key: "restoran" },
    { header: "Perawatan Pribadi dan Jasa Lainnya", key: "perawatan" },
  ];

  let newXml = xmlContent;

  groupSections.forEach(({ header, key }) => {
    const data = groupProcessedData[key] || {};
    const groupNameLower = header.toLowerCase();

    const headerRegex = new RegExp(`(<Content>${header}</Content>[\\s\\S]*?)(?=<Content>(?:Makanan|Pakaian|Perumahan|Perlengkapan|Kesehatan|Transportasi|Informasi|Rekreasi|Pendidikan|Penyediaan|Perawatan)|</idPkg:Story>|$)`, "i");

    newXml = newXml.replace(headerRegex, (match, blockContent) => {
      let updatedBlock = blockContent;

      const yoyVal = data.yoy || 0.0;
      const andilYoyVal = data.andilYoy || 0.0;
      const andilMtmVal = data.andilMtm || 0.0;
      const ihkPrevVal = data.ihkSebelumnya || 104.5;
      const ihkNowVal = data.ihkBerjalan || 106.8;

      updatedBlock = updatedBlock.replace(/\$\{namaKelompok\}/g, groupNameLower);
      updatedBlock = updatedBlock.replace(/\$\{inflasiYoy\}/g, toIndoNum(Math.abs(yoyVal)));
      updatedBlock = updatedBlock.replace(/\$\{deflasiYoy\}/g, toIndoNum(Math.abs(yoyVal)));
      updatedBlock = updatedBlock.replace(/\$\{indeksTahunSebelumnya\}/g, toIndoNum(ihkPrevVal));
      updatedBlock = updatedBlock.replace(/\$\{indeksSaatIni\}/g, toIndoNum(ihkNowVal));

      updatedBlock = updatedBlock.replace(/\$\{andilInflasiYoy\}/g, toIndoNum(Math.abs(andilYoyVal)));
      updatedBlock = updatedBlock.replace(/\$\{andilDeflasiYoy\}/g, toIndoNum(Math.abs(andilYoyVal)));
      updatedBlock = updatedBlock.replace(/\$\{andilInflasiMtm\}/g, toIndoNum(Math.abs(andilMtmVal)));
      updatedBlock = updatedBlock.replace(/\$\{andilDeflasiMtm\}/g, toIndoNum(Math.abs(andilMtmVal)));

      return updatedBlock;
    });
  });

  return newXml;
};

/**
 * Pindai direktori idmlExtract dan ganti seluruh placeholder ${...}
 */
export const runIdmlTemplateFiller = async (targetCity = "Kota Malang") => {
  console.log(`🚀 Memproses template IDML XML untuk kota: ${targetCity}...`);

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

  // Add mimetype
  const mimetypePath = path.join(IDML_DIR, "mimetype");
  if (fs.existsSync(mimetypePath)) {
    zip.addFile("mimetype", fs.readFileSync(mimetypePath));
  }

  // Rekursif salin & ganti seluruh file XML di idmlExtract ke outDir & zip
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

  // 4. Simpan output IDML
  const exportDir = path.resolve(__dirname, "../export/analysis_files");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const cleanCity = targetCity.replace(/[^a-zA-Z0-9]/g, "_");
  const idmlOutputPath = path.join(exportDir, `BRS_Populated_${cleanCity}.idml`);
  zip.writeZip(idmlOutputPath);

  // 5. Verifikasi akhir: Pastikan 0 placeholder tersisa pada output XML
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
  const cityArg = process.argv[2] || "Kota Malang";
  runIdmlTemplateFiller(cityArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Error processIdmlTemplate:", err.message);
      process.exit(1);
    });
}
