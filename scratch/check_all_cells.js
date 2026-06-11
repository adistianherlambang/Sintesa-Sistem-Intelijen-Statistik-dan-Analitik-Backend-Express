import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, '../../hasilAnalisis.xlsx');
const workbook = XLSX.readFile(excelPath);

let totalNumbers = 0;
workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    for (const key in sheet) {
        if (key.startsWith('!')) continue;
        const cell = sheet[key];
        if (cell && cell.t === 'n') {
            totalNumbers++;
            if (totalNumbers <= 10) {
                console.log(`[${sheetName}] Cell ${key}: value=${cell.v}`);
            }
        }
    }
});
console.log("Total numeric cells in workbook:", totalNumbers);
