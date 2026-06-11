import AdmZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zipPath = path.resolve(__dirname, '../../perkembanganIHK.idml');
const zip = new AdmZip(zipPath);
const zipEntries = zip.getEntries();

console.log(`Total files in IDML zip: ${zipEntries.length}`);

zipEntries.forEach((entry) => {
    if (entry.isDirectory) return;
    const txt = entry.getData().toString('utf8');
    if (txt.includes('Metro') || txt.includes('METRO') || txt.includes('inflasi')) {
        console.log(`Found match in file: ${entry.entryName} (size: ${entry.header.size} bytes)`);
        
        // Let's print a small snippet of where the match is
        const idx = txt.indexOf('Metro');
        const start = Math.max(0, idx - 100);
        const end = Math.min(txt.length, idx + 200);
        console.log(`  Snippet: ...${txt.substring(start, end).replace(/\s+/g, ' ')}...`);
    }
});
