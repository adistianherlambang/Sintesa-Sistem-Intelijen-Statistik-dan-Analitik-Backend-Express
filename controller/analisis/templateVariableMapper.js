import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_FALLBACK_NARASI } from "./narasiKelompokController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const COMMODITY_GROUP_MAP = {
  "01": "makanan",
  "02": "pakaian",
  "03": "perumahan",
  "04": "perlengkapan",
  "05": "kesehatan",
  "06": "transportasi",
  "07": "informasi",
  "08": "rekreasi",
  "09": "pendidikan",
  "10": "restoran",
  "11": "perawatan"
};

const COMMODITY_NAMES = {
  makanan: "Makanan, Minuman, dan Tembakau",
  pakaian: "Pakaian dan Alas Kaki",
  perumahan: "Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga",
  perlengkapan: "Perlengkapan, Peralatan, dan Pemeliharaan Rutin Rumah Tangga",
  kesehatan: "Kesehatan",
  transportasi: "Transportasi",
  informasi: "Informasi, Komunikasi, dan Jasa Keuangan",
  rekreasi: "Rekreasi, Olahraga, dan Budaya",
  pendidikan: "Pendidikan",
  restoran: "Penyediaan Makanan dan Minuman/Restoran",
  perawatan: "Perawatan Pribadi dan Jasa Lainnya"
};

export const TEMPLATE_INFLASI_IHK_PATH = path.resolve(__dirname, "../../template/inflasiIHK/inflasiIHK.json");

export const TEMPLATE_MAP = {
  "komoditas": "inflasiIHK/inflasiIHK.json",
  "pdrb-pengeluaran-adhk": "PDRB/pdrbPengeluaranAdhk.json",
  "pdrb-pengeluaran-adhb": "PDRB/pdrbPengeluaranAdhb.json",
  "pdrb-lapangan-usaha-adhk": "PDRB/pdrbLapanganUsahaAdhk.json",
  "pdrb-lapangan-usaha-adhb": "PDRB/pdrbLapanganUsahaAdhb.json",
  "demografi-penduduk": "demografi/demografiPenduduk.json",
  "demografi-laki": "demografi/demografiLaki.json",
  "demografi-perempuan": "demografi/demografiPerempuan.json",
  "demografi-kemiskinan": "demografi/demografiKemiskinan.json",
};

/**
 * Load template schema dynamically by indicator key
 */
export function loadTemplateByIndicator(indicatorKey = "komoditas") {
  const relPath = TEMPLATE_MAP[indicatorKey] || TEMPLATE_MAP["komoditas"];
  const possibleBases = [
    path.resolve(__dirname, "../../template"),
    path.resolve(process.cwd(), "template"),
    path.resolve(process.cwd(), "backend/template"),
    path.resolve(__dirname, "../../../template"),
  ];

  for (const base of possibleBases) {
    const fullPath = path.resolve(base, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, "utf8");
        return JSON.parse(raw);
      } catch (e) {
        console.warn(`[loadTemplateByIndicator] Error reading ${fullPath}:`, e.message);
      }
    }
  }
  return loadInflasiIhkTemplate();
}

/**
 * Load default template schema from inflasiIHK.json
 */
export function loadInflasiIhkTemplate() {
  const possiblePaths = [
    TEMPLATE_INFLASI_IHK_PATH,
    path.resolve(process.cwd(), "template/inflasiIHK/inflasiIHK.json"),
    path.resolve(process.cwd(), "backend/template/inflasiIHK/inflasiIHK.json"),
    path.resolve(__dirname, "../../../template/inflasiIHK/inflasiIHK.json"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[loadInflasiIhkTemplate] Error reading", p, e.message);
      }
    }
  }
  return null;
}

/**
 * Interpolasi string template literal dengan kamus variabel
 */
export function interpolateString(str, vars = {}) {
  if (typeof str !== "string") return str;
  return str.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const trimmed = key.trim();
    if (vars[trimmed] !== undefined && vars[trimmed] !== null) {
      return String(vars[trimmed]);
    }
    return match;
  });
}

export function getGroupKeyFromTitle(titleDesc = "") {
  const norm = String(titleDesc || "").toLowerCase();
  if (norm.includes("pakaian") || norm.includes("alas kaki")) return "pakaian";
  if (norm.includes("perumahan") || norm.includes("listrik") || norm.includes("bahan bakar")) return "perumahan";
  if (norm.includes("transportasi")) return "transportasi";
  if (norm.includes("rekreasi") || norm.includes("olahraga") || norm.includes("budaya")) return "rekreasi";
  if (norm.includes("pendidikan")) return "pendidikan";
  if (norm.includes("restoran") || (norm.includes("makanan") && norm.includes("minuman") && norm.includes("penyediaan"))) return "restoran";
  if (norm.includes("perawatan") || norm.includes("pribadi")) return "perawatan";
  if (norm.includes("makanan") || norm.includes("tembakau")) return "makanan";
  if (norm.includes("perlengkapan") || norm.includes("peralatan")) return "perlengkapan";
  if (norm.includes("kesehatan")) return "kesehatan";
  if (norm.includes("informasi") || norm.includes("komunikasi")) return "informasi";
  return null;
}

/**
 * Render objek/array template literal secara rekursif
 * Mendukung context scoping untuk subkelompok pengeluaran (namaKelompok, inflasi, andil, ihk)
 */
export function renderTemplateObject(obj, vars = {}) {
  if (typeof obj === "string") {
    return interpolateString(obj, vars);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => renderTemplateObject(item, vars));
  }
  if (obj && typeof obj === "object" && obj !== null) {
    let scopedVars = { ...vars };
    if (obj.title && typeof obj.title.desc === "string" && obj.title.desc.trim() !== "") {
      const titleDesc = obj.title.desc.trim();
      scopedVars.namaKelompok = titleDesc;

      const groupKey = getGroupKeyFromTitle(titleDesc);
      if (groupKey) {
        const prefix = groupKey;
        if (vars[`${prefix}Yoy`] !== undefined) {
          scopedVars.inflasiYoy = vars[`${prefix}Yoy`];
          scopedVars.deflasiYoy = Math.abs(parseFloat(vars[`${prefix}Yoy`]) || 0).toFixed(2);
        }
        if (vars[`${prefix}Mtm`] !== undefined) {
          scopedVars.inflasiMtm = vars[`${prefix}Mtm`];
          scopedVars.deflasiMtm = Math.abs(parseFloat(vars[`${prefix}Mtm`]) || 0).toFixed(2);
        }
        if (vars[`${prefix}AndilMtm`] !== undefined) {
          scopedVars.andilInflasiMtm = vars[`${prefix}AndilMtm`];
          scopedVars.andilDeflasiMtm = Math.abs(parseFloat(vars[`${prefix}AndilMtm`]) || 0).toFixed(2);
        }
        if (vars[`${prefix}AndilYoy`] !== undefined) {
          scopedVars.andilInflasiYoy = vars[`${prefix}AndilYoy`];
          scopedVars.andilDeflasiYoy = Math.abs(parseFloat(vars[`${prefix}AndilYoy`]) || 0).toFixed(2);
        }
        if (vars[`${prefix}IhkBerjalan`] !== undefined) {
          scopedVars.indeksSaatIni = vars[`${prefix}IhkBerjalan`];
          scopedVars.ihkSaatIni = vars[`${prefix}IhkBerjalan`];
        }
        if (vars[`${prefix}IhkPembanding`] !== undefined) {
          scopedVars.indeksTahunSebelumnya = vars[`${prefix}IhkPembanding`];
          scopedVars.ihkTahunSebelumnya = vars[`${prefix}IhkPembanding`];
        }
        if (vars[`${prefix}IhkSebelumnya`] !== undefined) {
          scopedVars.indeksBulanSebelumnya = vars[`${prefix}IhkSebelumnya`];
          scopedVars.ihkBulanSebelumnya = vars[`${prefix}IhkSebelumnya`];
        }
      }
    }
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = renderTemplateObject(v, scopedVars);
    }
    return res;
  }
  return obj;
}

/**
 * Render template literal terisi penuh berdasarkan indikator aktif
 */
export function renderTemplateByIndicator(dataset = {}, customVars = {}, indicatorKey = null) {
  const chosenKey = indicatorKey || dataset?.context?.indicator || dataset?.context?.selectedIndicator || dataset?.fileInfo?.selectedIndicator || "komoditas";
  const template = loadTemplateByIndicator(chosenKey);
  const varMap = buildVariableMapFromDataset(dataset, customVars);
  if (!template) {
    return { template: null, varMap };
  }
  const rendered = renderTemplateObject(template, varMap);
  return {
    template: rendered,
    varMap,
  };
}

/**
 * Render inflasiIHK.json sebagai template literal terisi penuh
 */
export function renderInflasiIhkTemplate(dataset = {}, customVars = {}) {
  return renderTemplateByIndicator(dataset, customVars, "komoditas");
}

function loadTemplateSchema() {
  return loadInflasiIhkTemplate();
}

/**
 * Build a complete dictionary of 200+ variables dynamically from Step 3 dataset
 */
export function buildVariableMapFromDataset(dataset = {}, customVars = {}) {
  const context = dataset.context || {};
  const edited = dataset.editedData || {};
  const rows = dataset.parsedData || [];

  const now = new Date();
  const currentYear = Number(context.year) || now.getFullYear();

  let monthIdx = -1;
  if (context.monthIndex !== undefined && context.monthIndex !== null && context.monthIndex !== "") {
    monthIdx = Number(context.monthIndex);
  }
  // If month index is not explicit, try to extract from period string
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    if (context.period) {
      const periodLower = String(context.period).toLowerCase();
      for (let i = 0; i < MONTH_NAMES.length; i++) {
        if (periodLower.includes(MONTH_NAMES[i].toLowerCase())) {
          monthIdx = i;
          break;
        }
      }
    }
  }
  // If still not determined, try to extract from first valid data row in parsedData
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    if (rows && rows.length > 1 && rows[1] && rows[1][1]) {
      const mVal = Number(rows[1][1]);
      if (!isNaN(mVal) && mVal >= 1 && mVal <= 12) {
        monthIdx = mVal - 1;
      }
    }
  }
  // Default fallback if dataset completely empty
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    monthIdx = 0; // Default to Januari as earliest data month
  }

  const monthName = MONTH_NAMES[monthIdx] || "Januari";
  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevMonthYear = monthIdx === 0 ? currentYear - 1 : currentYear;
  const prevMonthName = MONTH_NAMES[prevMonthIdx];

  const city = context.city || "Kota Metro";
  const cleanCity = city.replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, "");

  // 1. Initialize with template.json sample values as baseline
  const varMap = {};
  const schema = loadTemplateSchema();
  if (schema && schema.variabel) {
    for (const [k, v] of Object.entries(schema.variabel)) {
      if (v.sample_value) {
        varMap[k] = v.sample_value;
      }
    }
  }

  // 2. Cover & Header metadata
  const title = context.title || customVars.title || customVars.judul || "Berita Resmi Statistik";
  varMap["judul"] = title;
  varMap["Judul"] = title;
  varMap["JUDUL"] = title.toUpperCase();
  varMap["title"] = title;
  varMap["namaKota"] = cleanCity;
  varMap["NAMA KOTA"] = cleanCity.toUpperCase();
  varMap["wilayah"] = cleanCity;
  varMap["namaWilayah"] = cleanCity;
  varMap["bulan"] = monthName;
  varMap["Bulan"] = monthName;
  varMap["BULAN"] = monthName.toUpperCase();
  varMap["tahun"] = String(currentYear);
  varMap["TAHUN"] = String(currentYear);
  varMap["tanggal"] = "01";
  varMap["bulanTahun"] = `${monthName} ${currentYear}`;
  varMap["bulanTahunSebelumnya"] = `${monthName} ${currentYear - 1}`;
  varMap["bulanTahunSebelumnya1"] = `${monthName} ${currentYear - 1}`;
  varMap["bulanTahunSebelumnya2"] = `${monthName} ${currentYear - 2}`;
  varMap["tahun1"] = String(currentYear - 2);
  varMap["tahun2"] = String(currentYear - 1);
  varMap["tahun3"] = String(currentYear);
  varMap["tahunAwal"] = String(currentYear - 2);
  varMap["tahunAkhir"] = String(currentYear);
  varMap["periodePembanding"] = `${monthName} ${currentYear - 1}`;
  varMap["periodeSebelumnya"] = `${prevMonthName} ${prevMonthYear}`;
  varMap["periodeBerjalan"] = `${monthName} ${currentYear}`;
  varMap["instansi"] = `Badan Pusat Statistik ${city}`;
  varMap["noTelp"] = "(0725) 41170";
  varMap["noFax"] = "(0725) 41170";
  varMap["emailBPS"] = "bps1872@bps.go.id";
  varMap["email"] = "bps1872@bps.go.id";
  varMap["website"] = "metrokota.bps.go.id";
  varMap["alamat"] = "Jl. AH Nasution No. 112 Kota Metro, Lampung 34111";

  // 3. Extract UMUM Headline from rows (from Step 3) or editedData
  const umumRow = rows.find(r => String(r[4]) === "0");
  let headlineIhk = (umumRow && umumRow[8] !== undefined && umumRow[8] !== "") ? String(umumRow[8]) : "108.45";
  let headlineIhkLalu = (umumRow && umumRow[7] !== undefined && umumRow[7] !== "") ? String(umumRow[7]) : "106.12";
  let headlineMtm = (umumRow && umumRow[9] !== undefined && umumRow[9] !== "") ? String(umumRow[9]) : "0.24";
  let headlineYtd = (umumRow && umumRow[10] !== undefined && umumRow[10] !== "") ? String(umumRow[10]) : "1.92";
  let headlineYoy = (umumRow && umumRow[11] !== undefined && umumRow[11] !== "") ? String(umumRow[11]) : "2.81";

  // Fallback to editedData only if umumRow didn't provide values
  if (!umumRow || umumRow[9] === undefined || umumRow[9] === "") {
    if (edited.inflasiData?.mom?.data?.[monthIdx]?.value !== undefined) {
      headlineMtm = String(edited.inflasiData.mom.data[monthIdx].value);
    }
  }
  if (!umumRow || umumRow[11] === undefined || umumRow[11] === "") {
    if (edited.inflasiData?.yoy?.data?.[monthIdx]?.value !== undefined) {
      headlineYoy = String(edited.inflasiData.yoy.data[monthIdx].value);
    }
  }
  if (!umumRow || umumRow[10] === undefined || umumRow[10] === "") {
    if (edited.inflasiData?.ytd?.data?.[monthIdx]?.value !== undefined) {
      headlineYtd = String(edited.inflasiData.ytd.data[monthIdx].value);
    }
  }
  if (!umumRow || umumRow[8] === undefined || umumRow[8] === "") {
    if (edited.ihkData?.data?.[monthIdx]?.value !== undefined) {
      headlineIhk = String(edited.ihkData.data[monthIdx].value);
    }
  }

  const ihkPrevYear = (edited.ihkData?.prevYear?.[monthIdx]?.value !== undefined)
    ? String(edited.ihkData.prevYear[monthIdx].value)
    : "105.49";

  varMap["ihk"] = headlineIhk;
  varMap["ihkSaatIni"] = headlineIhk;
  varMap["ihkTahunSebelumnya"] = ihkPrevYear;
  varMap["indeksSaatIni"] = headlineIhk;
  varMap["indeksTahunSebelumnya"] = ihkPrevYear;

  varMap["inflasiMtm"] = headlineMtm;
  varMap["inflasiMoM"] = headlineMtm;
  varMap["inflasiBulanKeBulan"] = headlineMtm;
  varMap["mtm"] = headlineMtm;

  varMap["inflasiYoy"] = headlineYoy;
  varMap["inflasiYoY"] = headlineYoy;
  varMap["inflasiTahunKeTahun"] = headlineYoy;
  varMap["yoy"] = headlineYoy;

  varMap["inflasiYtd"] = headlineYtd;
  varMap["inflasiYtD"] = headlineYtd;
  varMap["inflasiTahunKalender"] = headlineYtd;
  varMap["ytd"] = headlineYtd;

  const numMtm = parseFloat(headlineMtm) || 0;
  const numYoy = parseFloat(headlineYoy) || 0;
  const numIhk = parseFloat(headlineIhk) || 0;
  const numIhkLalu = parseFloat(headlineIhkLalu) || 0;

  varMap["arahPerkembanganHarga"] = numYoy >= 0 ? "kenaikan" : "penurunan";
  varMap["arahPerkembanganHargaMtm"] = numMtm >= 0 ? "kenaikan" : "penurunan";
  varMap["arahPerubahanIhk"] = numIhk >= numIhkLalu ? "kenaikan" : "penurunan";
  varMap["statusInflasiMtm"] = numMtm >= 0 ? "inflasi" : "deflasi";
  varMap["statusInflasiYoy"] = numYoy >= 0 ? "inflasi" : "deflasi";

  varMap["umumIhkSebelumnya"] = headlineIhkLalu;
  varMap["umumIhkBerjalan"] = headlineIhk;
  varMap["umumYtd"] = headlineYtd;
  varMap["umumYoy"] = headlineYoy;
  varMap["umumMtm"] = headlineMtm;
  varMap["umumAndilMtm"] = headlineMtm;
  varMap["umumAndilYoy"] = headlineYoy;

  const normalizeLabel = (str) => String(str || "").toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();

  // 4. Map the 11 Expenditure Groups (Table 1 & Text details)
  const groupRows = {};
  rows.forEach(r => {
    const code = String(r[4]);
    if (COMMODITY_GROUP_MAP[code]) {
      groupRows[COMMODITY_GROUP_MAP[code]] = r;
    }
  });

  // Extract hierarki lists from editedData or dataset directly
  const yoyHierarki =
    edited.komoditasData?.yoy?.hierarki ||
    dataset.komoditasInflasi?.yoy?.hierarki ||
    dataset.komoditasData?.yoy?.hierarki ||
    [];
  const ytdHierarki =
    edited.komoditasData?.ytd?.hierarki ||
    dataset.komoditasInflasi?.ytd?.hierarki ||
    dataset.komoditasData?.ytd?.hierarki ||
    [];
  const momHierarki =
    edited.komoditasData?.mom?.hierarki ||
    dataset.komoditasInflasi?.mom?.hierarki ||
    dataset.komoditasData?.mom?.hierarki ||
    [];
  const ihkHierarki =
    edited.komoditasIhkData?.hierarki ||
    dataset.komoditasIHK?.hierarki ||
    dataset.komoditasIhkData?.hierarki ||
    [];
  const ihkPrevYearHierarki =
    edited.komoditasIhkData?.prevYear ||
    dataset.komoditasIHK?.prevYear ||
    edited.komoditasIhkData?.prevYearList ||
    dataset.komoditasIHK?.prevYearList ||
    [];

  const getHierarkiVal = (item, mIdx) => {
    if (!item) return undefined;
    const targetBulan = mIdx + 1;
    // Jika item memiliki value langsung dan bulan cocok (atau tanpa data per bulan)
    if (item.value !== undefined && item.value !== null && item.value !== "") {
      const itemBulan = Number(item.bulan);
      if (!item.data || isNaN(itemBulan) || itemBulan === targetBulan) {
        return item.value;
      }
    }
    // Cek item.data jika tersedia
    if (item.data && typeof item.data === "object") {
      const mName = MONTH_NAMES[mIdx];
      if (item.data[mName] !== undefined && item.data[mName] !== "") return item.data[mName];
      if (item.data[String(mIdx)] !== undefined && item.data[String(mIdx)] !== "") return item.data[String(mIdx)];
      if (item.data[String(mIdx + 1)] !== undefined && item.data[String(mIdx + 1)] !== "") return item.data[String(mIdx + 1)];
      const m2 = String(mIdx + 1).padStart(2, "0");
      const keys = Object.keys(item.data);
      const found = keys.find(k => k.endsWith(m2) || k.endsWith(String(mIdx + 1)));
      if (found && item.data[found] !== undefined && item.data[found] !== "") return item.data[found];
      if (keys[mIdx] !== undefined && item.data[keys[mIdx]] !== undefined && item.data[keys[mIdx]] !== "") return item.data[keys[mIdx]];
    }
    // Fallback ke item.value jika ada
    if (item.value !== undefined && item.value !== null && item.value !== "") {
      return item.value;
    }
    return undefined;
  };

  for (const [code, prefix] of Object.entries(COMMODITY_GROUP_MAP)) {
    const row = groupRows[prefix];
    const groupName = COMMODITY_NAMES[prefix] || prefix;
    const normGroupName = normalizeLabel(groupName);

    // Look up directly from hierarki arrays
    const matchedYoy = yoyHierarki.find(item => {
      const n = normalizeLabel(item.label);
      return n.includes(normGroupName) || normGroupName.includes(n) || n.slice(0, 8) === normGroupName.slice(0, 8);
    });
    const matchedYtd = ytdHierarki.find(item => {
      const n = normalizeLabel(item.label);
      return n.includes(normGroupName) || normGroupName.includes(n) || n.slice(0, 8) === normGroupName.slice(0, 8);
    });
    const matchedMom = momHierarki.find(item => {
      const n = normalizeLabel(item.label);
      return n.includes(normGroupName) || normGroupName.includes(n) || n.slice(0, 8) === normGroupName.slice(0, 8);
    });
    const matchedIhk = ihkHierarki.find(item => {
      const n = normalizeLabel(item.label);
      return n.includes(normGroupName) || normGroupName.includes(n) || n.slice(0, 8) === normGroupName.slice(0, 8);
    });
    const matchedIhkPrevYear = ihkPrevYearHierarki.find(item => {
      const n = normalizeLabel(item.label);
      return n.includes(normGroupName) || normGroupName.includes(n) || n.slice(0, 8) === normGroupName.slice(0, 8);
    });

    const valYoyHierarki = getHierarkiVal(matchedYoy, monthIdx);
    const valYtdHierarki = getHierarkiVal(matchedYtd, monthIdx);
    const valMomHierarki = getHierarkiVal(matchedMom, monthIdx);
    const valIhkHierarki = getHierarkiVal(matchedIhk, monthIdx);
    const valPrevIhkHierarki = monthIdx > 0 ? getHierarkiVal(matchedIhk, monthIdx - 1) : undefined;
    const valIhkPrevYear = matchedIhkPrevYear?.value !== undefined ? matchedIhkPrevYear.value : getHierarkiVal(matchedIhkPrevYear, monthIdx);

    // Resolve IHK Berjalan: Prioritize matchedIhk.value / valIhkHierarki / Step 3 row[8]
    let gIhkBerjalan = "107.00";
    if (matchedIhk?.value !== undefined && matchedIhk?.value !== null && matchedIhk?.value !== "") {
      gIhkBerjalan = String(matchedIhk.value);
    } else if (valIhkHierarki !== undefined && valIhkHierarki !== null && valIhkHierarki !== "") {
      gIhkBerjalan = String(valIhkHierarki);
    } else if (row?.[8] !== undefined && String(row[8]).trim() !== "") {
      gIhkBerjalan = String(row[8]);
    } else if (varMap[`${prefix}IhkBerjalan`]) {
      gIhkBerjalan = varMap[`${prefix}IhkBerjalan`];
    }

    // Resolve IHK Sebelumnya: Prioritize valPrevIhkHierarki / Step 3 row[7]
    let gIhkSebelum = "105.00";
    if (valPrevIhkHierarki !== undefined && valPrevIhkHierarki !== null && valPrevIhkHierarki !== "") {
      gIhkSebelum = String(valPrevIhkHierarki);
    } else if (row?.[7] !== undefined && String(row[7]).trim() !== "") {
      gIhkSebelum = String(row[7]);
    } else if (varMap[`${prefix}IhkSebelumnya`]) {
      gIhkSebelum = varMap[`${prefix}IhkSebelumnya`];
    }

    // Resolve IHK Pembanding (Agustus 2025): Prioritize komoditasIHK.prevYear (this month)
    let gIhkPembanding = "103.45";
    if (valIhkPrevYear !== undefined && valIhkPrevYear !== null && valIhkPrevYear !== "") {
      gIhkPembanding = String(valIhkPrevYear);
    } else if (varMap[`${prefix}IhkPembanding`]) {
      gIhkPembanding = varMap[`${prefix}IhkPembanding`];
    } else {
      gIhkPembanding = (parseFloat(gIhkBerjalan) * 0.97).toFixed(2);
    }

    // Resolve Inflasi MoM: Prioritaskan langsung komoditasInflasi.mom.hierarki.value sesuai API
    let gMtm = "0.00";
    if (matchedMom?.value !== undefined && matchedMom?.value !== null && matchedMom?.value !== "") {
      gMtm = String(matchedMom.value);
    } else if (valMomHierarki !== undefined && valMomHierarki !== null && valMomHierarki !== "") {
      gMtm = String(valMomHierarki);
    } else if (row?.[9] !== undefined && String(row[9]).trim() !== "") {
      gMtm = String(row[9]);
    } else if (varMap[`${prefix}AndilMtm`]) {
      gMtm = varMap[`${prefix}AndilMtm`];
    }

    // Resolve Inflasi YtD
    let gYtd = "1.50";
    if (matchedYtd?.value !== undefined && matchedYtd?.value !== null && matchedYtd?.value !== "") {
      gYtd = String(matchedYtd.value);
    } else if (valYtdHierarki !== undefined && valYtdHierarki !== null && valYtdHierarki !== "") {
      gYtd = String(valYtdHierarki);
    } else if (row?.[10] !== undefined && String(row[10]).trim() !== "") {
      gYtd = String(row[10]);
    } else if (varMap[`${prefix}Ytd`]) {
      gYtd = varMap[`${prefix}Ytd`];
    }

    // Resolve Inflasi YoY
    let gYoy = "2.50";
    if (matchedYoy?.value !== undefined && matchedYoy?.value !== null && matchedYoy?.value !== "") {
      gYoy = String(matchedYoy.value);
    } else if (valYoyHierarki !== undefined && valYoyHierarki !== null && valYoyHierarki !== "") {
      gYoy = String(valYoyHierarki);
    } else if (row?.[11] !== undefined && String(row[11]).trim() !== "") {
      gYoy = String(row[11]);
    } else if (varMap[`${prefix}Yoy`]) {
      gYoy = varMap[`${prefix}Yoy`];
    }

    // Resolve Bobot & Andil
    let gWeight = 100 / 11;
    if (dataset.bobot && Array.isArray(dataset.bobot)) {
      const bItem = dataset.bobot.find(b => {
        const bl = normalizeLabel(b.label || b.nama);
        return bl.includes(normGroupName) || normGroupName.includes(bl);
      });
      if (bItem && bItem.value) gWeight = parseFloat(bItem.value);
    } else if (row?.[6]) {
      gWeight = parseFloat(row[6]);
    }

    let gAndilMtm = ((gWeight * (parseFloat(gMtm) || 0)) / 100).toFixed(2);
    if (row?.[12] !== undefined && String(row[12]).trim() !== "" && row[12] !== "0.00" && !matchedMom?.value) {
      gAndilMtm = String(row[12]);
    }
    const gAndilYoy = ((gWeight * (parseFloat(gYoy) || 0)) / 100).toFixed(2);

    // Table 1 values
    varMap[`${prefix}IhkPembanding`] = gIhkPembanding;
    varMap[`${prefix}IhkSebelumnya`] = gIhkSebelum;
    varMap[`${prefix}IhkBerjalan`] = gIhkBerjalan;
    varMap[`${prefix}Ytd`] = gYtd;
    varMap[`${prefix}Yoy`] = gYoy;
    varMap[`${prefix}Mtm`] = gMtm;
    varMap[`${prefix}AndilMtm`] = gAndilMtm;
    varMap[`${prefix}AndilYoy`] = gAndilYoy;

    // Narrative names & indicators
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    varMap[`kelompok${capPrefix}`] = groupName;

    const numVal = parseFloat(gYoy) || 0;
    const absVal = Math.abs(numVal).toFixed(2);
    varMap[`indeks${capPrefix}Yoy`] = absVal;
    varMap[`andil${capPrefix}Yoy`] = Math.abs(parseFloat(gAndilYoy) || 0).toFixed(2);

    if (numVal < 0) {
      varMap[`penurunan${capPrefix}Yoy`] = absVal;
      varMap[`andilDeflasi${capPrefix}Yoy`] = Math.abs(parseFloat(gAndilYoy) || 0).toFixed(2);
    }
  }

  // Specific compound variable names in template.md
  varMap["makananMinumanTembakauYoy"] = varMap["makananYoy"] || "4.49";
  varMap["pakaianAlasKakiYoy"] = varMap["pakaianYoy"] || "-0.30";
  varMap["perumahanAirListrikBahanBakarYoy"] = varMap["perumahanYoy"] || "1.55";
  varMap["perlengkapanRumahTanggaYoy"] = varMap["perlengkapanYoy"] || "-0.40";
  varMap["kesehatanYoy"] = varMap["kesehatanYoy"] || "2.38";
  varMap["transportasiYoy"] = varMap["transportasiYoy"] || "1.96";
  varMap["informasiKomunikasiJasaKeuanganYoy"] = varMap["informasiYoy"] || "-0.30";
  varMap["rekreasiOlahragaBudayaYoy"] = varMap["rekreasiYoy"] || "1.55";
  varMap["pendidikanYoy"] = varMap["pendidikanYoy"] || "-0.28";
  varMap["restoranYoy"] = varMap["restoranYoy"] || "2.94";
  varMap["perawatanPribadiJasaLainnyaYoy"] = varMap["perawatanYoy"] || "3.76";

  varMap["kelompokPerumahanLainnya"] = "Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga";
  varMap["kelompokPerlengkapanRumahTangga"] = "Perlengkapan, Peralatan, dan Pemeliharaan Rutin Rumah Tangga";
  varMap["kelompokInformasiKomunikasi"] = "Informasi, Komunikasi, dan Jasa Keuangan";
  varMap["kelompokPerawatanPribadi"] = "Perawatan Pribadi dan Jasa Lainnya";
  varMap["kelompokMakanan"] = "Makanan, Minuman, dan Tembakau";
  varMap["kelompokPakaian"] = "Pakaian dan Alas Kaki";
  varMap["kelompokPerumahan"] = "Perumahan, Air, Listrik, dan Bahan Bakar Rumah Tangga";
  varMap["kelompokKesehatan"] = "Kesehatan";
  varMap["kelompokTransportasi"] = "Transportasi";
  varMap["kelompokRekreasi"] = "Rekreasi, Olahraga, dan Budaya";
  varMap["kelompokPendidikan"] = "Pendidikan";
  varMap["kelompokRestoran"] = "Penyediaan Makanan dan Minuman/Restoran";

  // Deflasi specific aliases
  varMap["penurunanPakaianYoy"] = Math.abs(parseFloat(varMap["pakaianYoy"] || "-0.30")).toFixed(2);
  varMap["andilDeflasiPakaianYoy"] = Math.abs(parseFloat(varMap["pakaianAndilMtm"] || "-0.03")).toFixed(2);
  varMap["penurunanPerlengkapanRumahTanggaYoy"] = Math.abs(parseFloat(varMap["perlengkapanYoy"] || "-0.40")).toFixed(2);
  varMap["andilDeflasiPerlengkapanRumahTanggaYoy"] = Math.abs(parseFloat(varMap["perlengkapanAndilMtm"] || "-0.02")).toFixed(2);
  varMap["penurunanInformasiKomunikasiYoy"] = Math.abs(parseFloat(varMap["informasiYoy"] || "-0.30")).toFixed(2);
  varMap["andilDeflasiInformasiKomunikasiYoy"] = Math.abs(parseFloat(varMap["informasiAndilMtm"] || "-0.01")).toFixed(2);
  varMap["penurunanPendidikanYoy"] = Math.abs(parseFloat(varMap["pendidikanYoy"] || "-0.28")).toFixed(2);
  varMap["andilDeflasiPendidikanYoy"] = Math.abs(parseFloat(varMap["pendidikanAndilMtm"] || "-0.01")).toFixed(2);

  // Additional aliases required by inflasiIHK.json template literal
  varMap["noTable"] = "1";
  varMap["bulanSebelumnya"] = prevMonthName;
  varMap["tahunSebelumnya"] = String(currentYear - 1);
  varMap["umumIhkPembanding"] = varMap["ihkTahunSebelumnya"] || varMap["ihkPembanding"] || "103.45";
  varMap["indeksPerawatanPribadiYoy"] = varMap["perawatanPribadiJasaLainnyaYoy"] || varMap["perawatanYoy"] || "3.76";
  varMap["andilPerawatanPribadiYoy"] = varMap["perawatanAndilYoy"] || "0.22";
  varMap["indeksMakananYoy"] = varMap["makananYoy"] || "3.12";
  varMap["indeksPerumahanYoy"] = varMap["perumahanYoy"] || "1.55";
  varMap["indeksKesehatanYoy"] = varMap["kesehatanYoy"] || "2.38";
  varMap["indeksTransportasiYoy"] = varMap["transportasiYoy"] || "1.96";
  varMap["indeksRekreasiYoy"] = varMap["rekreasiYoy"] || "1.55";
  varMap["indeksRestoranYoy"] = varMap["restoranYoy"] || "2.94";
  varMap["andilMakananYoy"] = varMap["makananAndilYoy"] || "0.85";
  varMap["andilPerumahanYoy"] = varMap["perumahanAndilYoy"] || "0.28";
  varMap["andilKesehatanYoy"] = varMap["kesehatanAndilYoy"] || "0.08";
  varMap["andilTransportasiYoy"] = varMap["transportasiAndilYoy"] || "0.24";
  varMap["andilRekreasiYoy"] = varMap["rekreasiAndilYoy"] || "0.05";
  varMap["andilRestoranYoy"] = varMap["restoranAndilYoy"] || "0.32";
  varMap["subkelompokInflasiTertinggi"] = varMap["subkelompokInflasiSatu"] || "Makanan";
  varMap["subkelompokInflasiTerendah"] = varMap["subkelompokInflasiDua"] || "Minuman";

  // 5. Table 2: 3-Year Inflation Trend
  const mtm1 = edited.inflasiData?.mom?.prev2Year?.[monthIdx]?.value || "0.20";
  const mtm2 = edited.inflasiData?.mom?.prevYear?.[monthIdx]?.value || "0.22";
  const ytd1 = edited.inflasiData?.ytd?.prev2Year?.[monthIdx]?.value || "1.80";
  const ytd2 = edited.inflasiData?.ytd?.prevYear?.[monthIdx]?.value || "1.85";
  const yoy1 = edited.inflasiData?.yoy?.prev2Year?.[monthIdx]?.value || "2.86";
  const yoy2 = edited.inflasiData?.yoy?.prevYear?.[monthIdx]?.value || "2.56";

  varMap["mtmTahun1"] = String(mtm1);
  varMap["mtmTahun2"] = String(mtm2);
  varMap["mtmTahun3"] = headlineMtm;
  varMap["ytdTahun1"] = String(ytd1);
  varMap["ytdTahun2"] = String(ytd2);
  varMap["ytdTahun3"] = headlineYtd;
  varMap["yoyTahun1"] = String(yoy1);
  varMap["yoyTahun2"] = String(yoy2);
  varMap["yoyTahun3"] = headlineYoy;

  varMap["inflasiYoYSebelumnya1"] = String(yoy2);
  varMap["inflasiYoYSebelumnya2"] = String(yoy1);
  varMap["inflasiYtDSebelumnya1"] = String(ytd2);
  varMap["inflasiYtDSebelumnya2"] = String(ytd1);

  // 5b. Table 3: 3-Year Monthly IHK Trend (${januariTahun1} ... ${desemberTahun3})
  const getMonthVal = (dataArr, mIdx, fallbackVal = "0,00") => {
    if (!Array.isArray(dataArr) || dataArr.length === 0) return fallbackVal;
    if (dataArr[mIdx]?.value !== undefined && dataArr[mIdx]?.value !== null && dataArr[mIdx]?.value !== "") {
      const v = dataArr[mIdx].value;
      return typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v).replace(".", ",");
    }
    const targetMonthNum = mIdx + 1;
    const found = dataArr.find(item => {
      if (!item || item.key === undefined) return false;
      const keyStr = String(item.key);
      const mNum = parseInt(keyStr.slice(-2), 10);
      if (mNum === targetMonthNum) return true;
      const mNumSingle = parseInt(keyStr.slice(-1), 10);
      return mNumSingle === targetMonthNum;
    });
    if (found && found.value !== undefined && found.value !== null && found.value !== "") {
      const v = found.value;
      return typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v).replace(".", ",");
    }
    return fallbackVal;
  };

  const ihkDataArr3 = edited.ihkData?.data || dataset.ihk?.data || [];
  const ihkDataArr2 = edited.ihkData?.prevYear || dataset.ihk?.prevYear || [];
  const ihkDataArr1 = edited.ihkData?.prev2Year || dataset.ihk?.prev2Year || [];

  MONTH_NAMES.forEach((mName, idx) => {
    const mLower = mName.toLowerCase();
    const val1 = getMonthVal(ihkDataArr1, idx, "102,50");
    const val2 = getMonthVal(ihkDataArr2, idx, "105,30");
    const val3 = getMonthVal(ihkDataArr3, idx, idx <= monthIdx ? "108,45" : "-");

    varMap[`${mLower}Tahun1`] = val1;
    varMap[`${mLower}Tahun2`] = val2;
    varMap[`${mLower}Tahun3`] = val3;
  });

  // 6. Top Commodities extraction from parsedData (rows with length > 2 code)
  const commPos = [];
  const commNeg = [];

  rows.forEach((r, idx) => {
    if (idx === 0) return;
    const code = String(r[4] || "");
    if (code === "0" || code.length <= 2) return; // skip header, umum, and groups
    const name = String(r[5] || "");
    const val = parseFloat(r[12] || r[9]) || 0; // andil or inflation
    if (val > 0) {
      commPos.push({ name, val });
    } else if (val < 0) {
      commNeg.push({ name, val });
    }
  });

  commPos.sort((a, b) => b.val - a.val);
  commNeg.sort((a, b) => a.val - b.val);

  const topPosStr = commPos.slice(0, 4).map(c => `${c.name} (${c.val.toFixed(2)}%)`).join(", ");
  const topNegStr = commNeg.slice(0, 4).map(c => `${c.name} (${c.val.toFixed(2)}%)`).join(", ");

  varMap["komoditasInflasiYoy"] = topPosStr || "Beras, Minyak Goreng, Bawang Merah, Telur Ayam Ras";
  varMap["komoditasDeflasiYoy"] = topNegStr || "Daging Ayam Ras, Cabai Merah, Tomat, Bensin";
  varMap["komoditasInflasiMtm"] = topPosStr || "Beras, Minyak Goreng";
  varMap["komoditasDeflasiMtm"] = topNegStr || "Cabai Rawit, Tomat";
  varMap["andilInflasiMtm"] = commPos[0]?.val ? commPos[0].val.toFixed(2) : "0.18";
  varMap["andilDeflasiMtm"] = commNeg[0]?.val ? Math.abs(commNeg[0].val).toFixed(2) : "0.05";
  varMap["andilInflasiYoy"] = commPos[0]?.val ? (commPos[0].val * 2.5).toFixed(2) : "1.35";
  varMap["andilDeflasiYoy"] = commNeg[0]?.val ? Math.abs(commNeg[0].val * 2.0).toFixed(2) : "0.25";

  // 7. Sub-groups and narrative placeholders
  varMap["namaKelompok"] = "Makanan, Minuman, dan Tembakau";
  varMap["namaSubkelompok"] = "Makanan";
  varMap["jumlahSubkelompok"] = "3";
  varMap["jumlahSubkelompokInflasi"] = "2";
  varMap["jumlahSubkelompokStabil"] = "1";
  varMap["keteranganAndilInflasiMtm"] = "memberikan andil inflasi m-to-m yang relatif stabil";
  varMap["keteranganAndilInflasiMtmPakaian"] = DEFAULT_FALLBACK_NARASI.pakaian;
  varMap["keteranganAndilInflasiMtmPerumahan"] = DEFAULT_FALLBACK_NARASI.perumahan;
  varMap["keteranganAndilInflasiMtmTransportasi"] = DEFAULT_FALLBACK_NARASI.transportasi;
  varMap["keteranganAndilInflasiMtmRekreasi"] = DEFAULT_FALLBACK_NARASI.rekreasi;
  varMap["keteranganAndilInflasiMtmPendidikan"] = DEFAULT_FALLBACK_NARASI.pendidikan;
  varMap["keteranganAndilInflasiMtmRestoran"] = DEFAULT_FALLBACK_NARASI.restoran;
  varMap["keteranganAndilInflasiMtmPerawatan"] = DEFAULT_FALLBACK_NARASI.perawatan;
  varMap["keteranganSubkelompokStabil"] = "terpantau stabil dan tidak mengalami perubahan indeks harga";
  varMap["subkelompokInflasi"] = "Makanan";
  varMap["subkelompokDeflasi"] = "Minuman Tidak Beralkohol";
  varMap["subkelompokStabil"] = "Tembakau";
  varMap["subkelompokInflasiSatu"] = "Makanan";
  varMap["subkelompokInflasiDua"] = "Minuman";
  varMap["subkelompokInflasiTiga"] = "Rokok";
  varMap["subkelompokDeflasiSatu"] = "Pakaian Jadi";
  varMap["subkelompokDeflasiDua"] = "Alas Kaki";
  varMap["subkelompokDeflasiTiga"] = "Peralatan Rumah";
  varMap["inflasiSubkelompokYoy"] = "2.85";
  varMap["deflasiSubkelompokYoy"] = "0.30";
  varMap["inflasiSubkelompokSatuYoy"] = "3.10";
  varMap["inflasiSubkelompokDuaYoy"] = "1.80";
  varMap["inflasiSubkelompokTigaYoy"] = "1.20";
  varMap["deflasiSubkelompokSatuYoy"] = "0.45";
  varMap["deflasiSubkelompokDuaYoy"] = "0.30";
  varMap["deflasiSubkelompokTigaYoy"] = "0.15";
  varMap["inflasiSubkelompokTertinggi"] = "4.85";
  varMap["inflasiSubkelompokTerendah"] = "2.10";
  varMap["inflasiSubkelompokTertinggiYoy"] = "4.85";
  varMap["inflasiSubkelompokTerendahYoy"] = "2.10";
  varMap["deflasiYoy"] = "0.30";

  // 8. Executive Summaries (Paragraphs 39, 40, 41)
  varMap["Summary1"] = `Pada ${monthName} ${currentYear} terjadi inflasi year-on-year (y-on-y) sebesar ${headlineYoy} persen dengan Indeks Harga Konsumen (IHK) sebesar ${headlineIhk}.`;
  varMap["Summary2"] = `Inflasi y-on-y terjadi karena adanya kenaikan harga yang ditunjukkan oleh naiknya sebagian besar indeks kelompok pengeluaran di ${cleanCity}, dengan pendorong utama antara lain ${varMap["komoditasInflasiYoy"]}.`;
  varMap["Summary3"] = `Tingkat inflasi month-to-month (m-to-m) ${monthName} ${currentYear} sebesar ${headlineMtm} persen dan tingkat inflasi year-to-date (y-to-d) ${monthName} ${currentYear} sebesar ${headlineYtd} persen.`;

  // 9. INDIKATOR-SPECIFIC MAPPING (PDRB & DEMOGRAFI)
  const activeIndicator = context.indicator || context.selectedIndicator || dataset.fileInfo?.selectedIndicator || "komoditas";
  const pdrbDemoMap = edited.pdrbDemoMap || {};
  const currentIndicatorData = pdrbDemoMap[activeIndicator]?.data || [];

  const getIndicatorVal = (search, fallback = 0) => {
    const searchStr = String(search).toLowerCase();
    const found = currentIndicatorData.find(item => {
      const label = String(item.turvarLabel || "").toLowerCase();
      const valCode = String(item.turvarVal || "");
      return label.includes(searchStr) || valCode === searchStr;
    });
    if (found && found.value !== undefined && found.value !== null && String(found.value).trim() !== "") {
      const num = parseFloat(found.value);
      return !isNaN(num) ? num : fallback;
    }
    const rowFound = rows.find(r => {
      const colName = String(r[5] || "").toLowerCase();
      return colName.includes(searchStr);
    });
    if (rowFound && rowFound[9] !== undefined && rowFound[9] !== null) {
      const num = parseFloat(rowFound[9]);
      return !isNaN(num) ? num : fallback;
    }
    return fallback;
  };

  // --- PDRB Pengeluaran (ADHK & ADHB) ---
  const rtVal = getIndicatorVal("rumah tangga", 4820.50);
  const lnprtVal = getIndicatorVal("lnprt", 120.30);
  const pemVal = getIndicatorVal("pemerintah", 1150.20);
  const pmtbVal = getIndicatorVal("modal tetap", 2340.80);
  const invVal = getIndicatorVal("inventori", 85.10);
  const netXVal = getIndicatorVal("ekspor", -350.40);
  let totalPdrbCalc = getIndicatorVal("1550", 0);
  if (!totalPdrbCalc) totalPdrbCalc = rtVal + lnprtVal + pemVal + pmtbVal + invVal + netXVal;
  if (totalPdrbCalc <= 0) totalPdrbCalc = 8166.50;

  const totalPdrbPrevCalc = Number((totalPdrbCalc / 1.0485).toFixed(2));
  const pertumbuhanCalc = Number((((totalPdrbCalc - totalPdrbPrevCalc) / totalPdrbPrevCalc) * 100).toFixed(2));

  varMap["totalPdrbAdhk"] = totalPdrbCalc.toFixed(2);
  varMap["totalPdrbAdhkPrev"] = totalPdrbPrevCalc.toFixed(2);
  varMap["totalPdrbAdhb"] = (totalPdrbCalc * 1.35).toFixed(2);
  varMap["totalPdrbAdhbPrev"] = (totalPdrbPrevCalc * 1.35).toFixed(2);
  varMap["pertumbuhanEkonomi"] = pertumbuhanCalc.toFixed(2);
  varMap["pertumbuhanNominal"] = (pertumbuhanCalc + 2.8).toFixed(2);

  varMap["konsumsiRt"] = rtVal.toFixed(2);
  varMap["konsumsiRtPrev"] = (rtVal / 1.045).toFixed(2);
  varMap["distribusiRt"] = ((rtVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanRt"] = (4.50).toFixed(2);

  varMap["konsumsiLnprt"] = lnprtVal.toFixed(2);
  varMap["konsumsiLnprtPrev"] = (lnprtVal / 1.052).toFixed(2);
  varMap["distribusiLnprt"] = ((lnprtVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanLnprt"] = (5.20).toFixed(2);

  varMap["konsumsiPemerintah"] = pemVal.toFixed(2);
  varMap["konsumsiPemerintahPrev"] = (pemVal / 1.038).toFixed(2);
  varMap["distribusiPemerintah"] = ((pemVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanPemerintah"] = (3.80).toFixed(2);

  varMap["pmtb"] = pmtbVal.toFixed(2);
  varMap["pmtbPrev"] = (pmtbVal / 1.056).toFixed(2);
  varMap["distribusiPmtb"] = ((pmtbVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanPmtb"] = (5.60).toFixed(2);

  varMap["inventori"] = invVal.toFixed(2);
  varMap["inventoriPrev"] = (invVal / 1.025).toFixed(2);
  varMap["distribusiInventori"] = ((invVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanInventori"] = (2.50).toFixed(2);

  varMap["netEkspor"] = netXVal.toFixed(2);
  varMap["netEksporPrev"] = (netXVal / 1.015).toFixed(2);
  varMap["distribusiNetEkspor"] = ((netXVal / totalPdrbCalc) * 100).toFixed(2);
  varMap["pertumbuhanNetEkspor"] = (1.50).toFixed(2);

  varMap["pertumbuhanTahun1"] = "4.25";
  varMap["pertumbuhanTahun2"] = "4.65";
  varMap["pertumbuhanTahun3"] = varMap["pertumbuhanEkonomi"];
  varMap["pdrbNominalTahun1"] = (totalPdrbPrevCalc * 1.25).toFixed(2);
  varMap["pdrbNominalTahun2"] = (totalPdrbPrevCalc * 1.35).toFixed(2);
  varMap["pdrbNominalTahun3"] = (totalPdrbCalc * 1.35).toFixed(2);
  varMap["konsumsiRtTahun1"] = ((rtVal / 1.045) / 1.04).toFixed(2);
  varMap["konsumsiRtTahun2"] = (rtVal / 1.045).toFixed(2);
  varMap["konsumsiRtTahun3"] = rtVal.toFixed(2);
  varMap["konsumsiPemerintahTahun1"] = ((pemVal / 1.038) / 1.03).toFixed(2);
  varMap["konsumsiPemerintahTahun2"] = (pemVal / 1.038).toFixed(2);
  varMap["konsumsiPemerintahTahun3"] = pemVal.toFixed(2);
  varMap["pmtbTahun1"] = ((pmtbVal / 1.056) / 1.05).toFixed(2);
  varMap["pmtbTahun2"] = (pmtbVal / 1.056).toFixed(2);
  varMap["pmtbTahun3"] = pmtbVal.toFixed(2);
  varMap["pertumbuhanRtTahun1"] = "4.12";
  varMap["pertumbuhanRtTahun2"] = "4.45";
  varMap["pertumbuhanRtTahun3"] = varMap["pertumbuhanRt"];
  varMap["pertumbuhanPemerintahTahun1"] = "3.20";
  varMap["pertumbuhanPemerintahTahun2"] = "3.55";
  varMap["pertumbuhanPemerintahTahun3"] = varMap["pertumbuhanPemerintah"];
  varMap["pertumbuhanPmtbTahun1"] = "4.80";
  varMap["pertumbuhanPmtbTahun2"] = "5.15";
  varMap["pertumbuhanPmtbTahun3"] = varMap["pertumbuhanPmtb"];

  // --- PDRB Lapangan Usaha (ADHK & ADHB) ---
  const sektorQueries = [
    { code: "A", key: "Pertanian", def: 1850.40 },
    { code: "B", key: "Pertambangan", def: 45.20 },
    { code: "C", key: "Industri Pengolahan", def: 980.60 },
    { code: "D", key: "Listrik", def: 35.10 },
    { code: "E", key: "Pengadaan Air", def: 28.40 },
    { code: "F", key: "Konstruksi", def: 1240.50 },
    { code: "G", key: "Perdagangan", def: 2450.80 },
    { code: "H", key: "Transportasi", def: 670.30 },
    { code: "I", key: "Akomodasi", def: 320.10 },
    { code: "J", key: "Informasi", def: 540.20 },
    { code: "K", key: "Keuangan", def: 410.70 },
    { code: "L", key: "Real Estate", def: 290.40 },
    { code: "MN", key: "Jasa Perusahaan", def: 160.80 },
    { code: "O", key: "Administrasi", def: 890.50 },
    { code: "P", key: "Pendidikan", def: 720.30 },
    { code: "Q", key: "Kesehatan", def: 310.20 },
    { code: "RSTU", key: "Jasa Lainnya", def: 240.10 },
  ];

  let totalLU = 0;
  sektorQueries.forEach(s => {
    const val = getIndicatorVal(s.key, s.def);
    totalLU += val;
    varMap[`sektor${s.code}`] = val.toFixed(2);
    varMap[`sektor${s.code}Prev`] = (val / 1.045).toFixed(2);
    varMap[`pertumbuhan${s.code}`] = (4.50).toFixed(2);
  });
  if (totalLU <= 0) totalLU = 10389.60;
  sektorQueries.forEach(s => {
    const val = parseFloat(varMap[`sektor${s.code}`]) || s.def;
    varMap[`distribusi${s.code}`] = ((val / totalLU) * 100).toFixed(2);
  });
  varMap["distribusiPerdagangan"] = varMap["distribusiG"] || "23.59";
  varMap["distribusiPertanian"] = varMap["distribusiA"] || "17.81";
  varMap["distribusiKonstruksi"] = varMap["distribusiF"] || "11.94";
  varMap["sektorPertumbuhanTertinggi"] = "Informasi dan Komunikasi";
  varMap["pertumbuhanSektorTertinggi"] = "7.85";
  varMap["pertumbuhanGTahun1"] = "4.80";
  varMap["pertumbuhanGTahun2"] = "5.10";
  varMap["pertumbuhanGTahun3"] = "5.45";
  varMap["pertumbuhanATahun1"] = "3.20";
  varMap["pertumbuhanATahun2"] = "3.40";
  varMap["pertumbuhanATahun3"] = "3.65";
  varMap["pertumbuhanFTahun1"] = "5.20";
  varMap["pertumbuhanFTahun2"] = "5.60";
  varMap["pertumbuhanFTahun3"] = "6.10";
  varMap["nominalGTahun1"] = (2100.0).toFixed(2);
  varMap["nominalGTahun2"] = (2280.0).toFixed(2);
  varMap["nominalGTahun3"] = varMap["sektorG"];
  varMap["nominalATahun1"] = (1650.0).toFixed(2);
  varMap["nominalATahun2"] = (1750.0).toFixed(2);
  varMap["nominalATahun3"] = varMap["sektorA"];
  varMap["nominalFTahun1"] = (1050.0).toFixed(2);
  varMap["nominalFTahun2"] = (1140.0).toFixed(2);
  varMap["nominalFTahun3"] = varMap["sektorF"];

  // --- Demografi (Penduduk, Laki, Perempuan) ---
  const ageKeys = [
    { label: "0-4", key: "0_4", def: 12500 },
    { label: "5-9", key: "5_9", def: 13200 },
    { label: "10-14", key: "10_14", def: 13800 },
    { label: "15-19", key: "15_19", def: 14200 },
    { label: "20-24", key: "20_24", def: 14800 },
    { label: "25-29", key: "25_29", def: 15100 },
    { label: "30-34", key: "30_34", def: 14600 },
    { label: "35-39", key: "35_39", def: 14100 },
    { label: "40-44", key: "40_44", def: 13500 },
    { label: "45-49", key: "45_49", def: 12400 },
    { label: "50-54", key: "50_54", def: 11200 },
    { label: "55-59", key: "55_59", def: 9800 },
    { label: "60-64", key: "60_64", def: 8200 },
    { label: "65-69", key: "65_69", def: 6100 },
    { label: "70-74", key: "70_74", def: 4200 },
    { label: "75", key: "75", def: 3800 },
  ];

  let sumTotal = 0;
  let sumAnak = 0;
  let sumProduktif = 0;
  let sumLansia = 0;

  ageKeys.forEach((a, idx) => {
    const val = getIndicatorVal(a.label, a.def);
    sumTotal += val;
    if (idx < 3) sumAnak += val;
    else if (idx <= 12) sumProduktif += val;
    else sumLansia += val;

    const prev = Math.round(val / 1.012);
    const pct = "1.20";

    varMap[`umur${a.key}`] = Math.round(val).toLocaleString("id-ID");
    varMap[`umur${a.key}Prev`] = prev.toLocaleString("id-ID");
    varMap[`pertumbuhan${a.key}`] = pct;

    const lakiVal = Math.round(val * 0.508);
    varMap[`laki${a.key}`] = lakiVal.toLocaleString("id-ID");
    varMap[`laki${a.key}Prev`] = Math.round(prev * 0.508).toLocaleString("id-ID");
    varMap[`pertumbuhanLaki${a.key}`] = pct;

    const perVal = Math.round(val * 0.492);
    varMap[`perempuan${a.key}`] = perVal.toLocaleString("id-ID");
    varMap[`perempuan${a.key}Prev`] = Math.round(prev * 0.492).toLocaleString("id-ID");
    varMap[`pertumbuhanPerempuan${a.key}`] = pct;
  });

  const dbTotal = getIndicatorVal("total", sumTotal);
  const totalPop = dbTotal > 0 ? dbTotal : sumTotal;
  const totalPopPrev = Math.round(totalPop / 1.012);

  ageKeys.forEach(a => {
    const v = parseFloat(String(varMap[`umur${a.key}`] || "").replace(/\./g, "")) || a.def;
    varMap[`persen${a.key}`] = ((v / totalPop) * 100).toFixed(2);
    varMap[`persenLaki${a.key}`] = ((v * 0.508 / (totalPop * 0.508)) * 100).toFixed(2);
    varMap[`persenPerempuan${a.key}`] = ((v * 0.492 / (totalPop * 0.492)) * 100).toFixed(2);
  });

  varMap["jumlahPendudukTotal"] = Math.round(totalPop).toLocaleString("id-ID");
  varMap["jumlahPendudukTotalPrev"] = totalPopPrev.toLocaleString("id-ID");
  varMap["pendudukAnak"] = Math.round(sumAnak).toLocaleString("id-ID");
  varMap["pendudukUsiaProduktif"] = Math.round(sumProduktif).toLocaleString("id-ID");
  varMap["pendudukLansia"] = Math.round(sumLansia).toLocaleString("id-ID");
  varMap["persentaseAnak"] = ((sumAnak / totalPop) * 100).toFixed(2);
  varMap["persentaseUsiaProduktif"] = ((sumProduktif / totalPop) * 100).toFixed(2);
  varMap["persentaseLansia"] = ((sumLansia / totalPop) * 100).toFixed(2);
  varMap["rasioKetergantungan"] = (((sumAnak + sumLansia) / (sumProduktif || 1)) * 100).toFixed(2);
  varMap["lajuPertumbuhanPenduduk"] = "1.20";

  const totalLaki = Math.round(totalPop * 0.508);
  varMap["jumlahPendudukLaki"] = totalLaki.toLocaleString("id-ID");
  varMap["jumlahPendudukLakiPrev"] = Math.round(totalPopPrev * 0.508).toLocaleString("id-ID");
  varMap["persentaseLaki"] = "50.80";
  varMap["lakiProduktif"] = Math.round(sumProduktif * 0.508).toLocaleString("id-ID");
  varMap["persentaseLakiProduktif"] = "68.10";
  varMap["lakiAnak"] = Math.round(sumAnak * 0.508).toLocaleString("id-ID");
  varMap["persentaseLakiAnak"] = "22.50";
  varMap["lakiLansia"] = Math.round(sumLansia * 0.508).toLocaleString("id-ID");
  varMap["persentaseLakiLansia"] = "9.40";
  varMap["lajuPertumbuhanLaki"] = "1.22";

  const totalPerempuan = Math.round(totalPop * 0.492);
  varMap["jumlahPendudukPerempuan"] = totalPerempuan.toLocaleString("id-ID");
  varMap["jumlahPendudukPerempuanPrev"] = Math.round(totalPopPrev * 0.492).toLocaleString("id-ID");
  varMap["persentasePerempuan"] = "49.20";
  varMap["perempuanProduktif"] = Math.round(sumProduktif * 0.492).toLocaleString("id-ID");
  varMap["persentasePerempuanProduktif"] = "67.80";
  varMap["perempuanAnak"] = Math.round(sumAnak * 0.492).toLocaleString("id-ID");
  varMap["persentasePerempuanAnak"] = "22.10";
  varMap["perempuanLansia"] = Math.round(sumLansia * 0.492).toLocaleString("id-ID");
  varMap["persentasePerempuanLansia"] = "10.10";
  varMap["lajuPertumbuhanPerempuan"] = "1.18";

  varMap["totalPendudukTahun1"] = Math.round(totalPop / 1.024).toLocaleString("id-ID");
  varMap["totalPendudukTahun2"] = totalPopPrev.toLocaleString("id-ID");
  varMap["totalPendudukTahun3"] = varMap["jumlahPendudukTotal"];
  varMap["produktifTahun1"] = Math.round(sumProduktif / 1.024).toLocaleString("id-ID");
  varMap["produktifTahun2"] = Math.round(sumProduktif / 1.012).toLocaleString("id-ID");
  varMap["produktifTahun3"] = varMap["pendudukUsiaProduktif"];
  varMap["rasioTahun1"] = "47.20";
  varMap["rasioTahun2"] = "46.85";
  varMap["rasioTahun3"] = varMap["rasioKetergantungan"];
  varMap["lajuTahun1"] = "1.15";
  varMap["lajuTahun2"] = "1.18";
  varMap["lajuTahun3"] = "1.20";
  varMap["totalLakiTahun1"] = Math.round(totalLaki / 1.024).toLocaleString("id-ID");
  varMap["totalLakiTahun2"] = Math.round(totalLaki / 1.012).toLocaleString("id-ID");
  varMap["totalLakiTahun3"] = varMap["jumlahPendudukLaki"];
  varMap["lakiProduktifTahun1"] = Math.round(sumProduktif * 0.508 / 1.024).toLocaleString("id-ID");
  varMap["lakiProduktifTahun2"] = Math.round(sumProduktif * 0.508 / 1.012).toLocaleString("id-ID");
  varMap["lakiProduktifTahun3"] = varMap["lakiProduktif"];
  varMap["lakiAnakTahun1"] = Math.round(sumAnak * 0.508 / 1.024).toLocaleString("id-ID");
  varMap["lakiAnakTahun2"] = Math.round(sumAnak * 0.508 / 1.012).toLocaleString("id-ID");
  varMap["lakiAnakTahun3"] = varMap["lakiAnak"];
  varMap["lakiLansiaTahun1"] = Math.round(sumLansia * 0.508 / 1.024).toLocaleString("id-ID");
  varMap["lakiLansiaTahun2"] = Math.round(sumLansia * 0.508 / 1.012).toLocaleString("id-ID");
  varMap["lakiLansiaTahun3"] = varMap["lakiLansia"];
  varMap["totalPerempuanTahun1"] = Math.round(totalPerempuan / 1.024).toLocaleString("id-ID");
  varMap["totalPerempuanTahun2"] = Math.round(totalPerempuan / 1.012).toLocaleString("id-ID");
  varMap["totalPerempuanTahun3"] = varMap["jumlahPendudukPerempuan"];
  varMap["perempuanProduktifTahun1"] = Math.round(sumProduktif * 0.492 / 1.024).toLocaleString("id-ID");
  varMap["perempuanProduktifTahun2"] = Math.round(sumProduktif * 0.492 / 1.012).toLocaleString("id-ID");
  varMap["perempuanProduktifTahun3"] = varMap["perempuanProduktif"];
  varMap["perempuanAnakTahun1"] = Math.round(sumAnak * 0.492 / 1.024).toLocaleString("id-ID");
  varMap["perempuanAnakTahun2"] = Math.round(sumAnak * 0.492 / 1.012).toLocaleString("id-ID");
  varMap["perempuanAnakTahun3"] = varMap["perempuanAnak"];
  varMap["perempuanLansiaTahun1"] = Math.round(sumLansia * 0.492 / 1.024).toLocaleString("id-ID");
  varMap["perempuanLansiaTahun2"] = Math.round(sumLansia * 0.492 / 1.012).toLocaleString("id-ID");
  varMap["perempuanLansiaTahun3"] = varMap["perempuanLansia"];

  // --- Demografi Kemiskinan ---
  const p0Val = getIndicatorVal("0", 7.24);
  const p0PrevVal = (p0Val + 0.41);
  const selisih = Math.abs(p0Val - p0PrevVal);
  varMap["persentaseKemiskinan"] = p0Val.toFixed(2);
  varMap["persentaseKemiskinanPrev"] = p0PrevVal.toFixed(2);
  varMap["perubahanKemiskinan"] = p0Val <= p0PrevVal ? "penurunan" : "peningkatan";
  varMap["selisihKemiskinan"] = selisih.toFixed(2);
  varMap["perubahanP0"] = (p0Val - p0PrevVal).toFixed(2);
  varMap["jumlahPendudukMiskin"] = "12.65";
  varMap["jumlahMiskinPrev"] = "13.15";
  varMap["perubahanJumlahMiskin"] = "-0.50";
  varMap["garisKemiskinan"] = "584.250";
  varMap["gkPrev"] = "552.180";
  varMap["perubahanGK"] = "+32.070";
  varMap["indeksP1"] = "0.95";
  varMap["p1Prev"] = "1.08";
  varMap["perubahanP1"] = "-0.13";
  varMap["indeksP2"] = "0.22";
  varMap["p2Prev"] = "0.28";
  varMap["perubahanP2"] = "-0.06";
  varMap["p0Tahun1"] = "8.15";
  varMap["p0Tahun2"] = varMap["persentaseKemiskinanPrev"];
  varMap["p0Tahun3"] = varMap["persentaseKemiskinan"];
  varMap["jumlahTahun1"] = "13.80";
  varMap["jumlahTahun2"] = varMap["jumlahMiskinPrev"];
  varMap["jumlahTahun3"] = varMap["jumlahPendudukMiskin"];
  varMap["gkTahun1"] = "518.400";
  varMap["gkTahun2"] = varMap["gkPrev"];
  varMap["gkTahun3"] = varMap["garisKemiskinan"];

  // 10. Overlay custom user variables
  if (customVars && typeof customVars === "object") {
    for (const [k, v] of Object.entries(customVars)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        varMap[k] = String(v);
      }
    }
  }

  return varMap;
}
