import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, "../../hasilAnalisis.xlsx");
const workbook = XLSX.readFile(excelPath);

["Data 03", "I"].forEach((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  console.log(`\n=== Raw Cells for Sheet: ${sheetName} ===`);
  const json = XLSX.utils.sheet_to_json(sheet);
  console.log(`Length: ${json.length}`);
  for (let i = 0; i < Math.min(5, json.length); i++) {
    console.log(`Row ${i + 1}:`, json[i]);
  }
});
