import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, '../../hasilAnalisis.xlsx');
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets['Data 03'];
const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log("Full columns in Data 03 Row 1:", json[0]);
console.log("Full values in Data 03 Row 2:", json[1]);
