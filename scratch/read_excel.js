import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, '../../hasilAnalisis.xlsx');
const workbook = XLSX.readFile(excelPath);
console.log("Sheet Names:", workbook.SheetNames);

workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    console.log(`\n--- Sheet: ${sheetName} (ref: ${sheet['!ref']}) ---`);
    
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("First 10 rows:");
    json.slice(0, 10).forEach((row, i) => {
        console.log(`Row ${i + 1}:`, row.slice(0, 8));
    });
});
