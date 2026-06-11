import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, "../../hasilAnalisis.xlsx");
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets["Data 03"];
const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log("Header:", json[0]);
for (let i = 1; i < 20; i++) {
  console.log(`Row ${i + 1}:`, json[i]);
}
