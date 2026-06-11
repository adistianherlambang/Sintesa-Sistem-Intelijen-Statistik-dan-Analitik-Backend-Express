import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.resolve(__dirname, '../../hasilAnalisis.xlsx');
const workbook = XLSX.readFile(excelPath);

workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Sheet: ${sheetName}, total rows: ${json.length}`);
    let rowsWithData = 0;
    json.forEach((row, i) => {
        if (i === 0) return;
        const hasValuesPastName = row.slice(6).some(v => v !== undefined && v !== null && v !== "");
        if (hasValuesPastName) {
            rowsWithData++;
            if (rowsWithData <= 3) {
                console.log(`  Row ${i + 1}:`, row);
            }
        }
    });
    console.log(`  Total rows with data in sheet ${sheetName} (excluding header): ${rowsWithData}`);
});
