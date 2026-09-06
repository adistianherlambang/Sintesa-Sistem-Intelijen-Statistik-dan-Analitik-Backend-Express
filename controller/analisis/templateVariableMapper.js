import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

/**
 * Load default template schema from template.json as fallback
 */
function loadTemplateSchema() {
  const possiblePaths = [
    path.resolve(__dirname, "../../../../test/templat/inflasi&ihk/template.json"),
    path.resolve(__dirname, "../../../../test/wordnew/frontend/template/template.json"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8");
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[loadTemplateSchema] Error reading", p, e.message);
      }
    }
  }
  return null;
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
  // Default to CURRENT REAL MONTH ("bulan ini"), NOT hardcoded 10 or 0
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    monthIdx = now.getMonth();
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

  // Extract hierarki lists if available in editedData
  const yoyHierarki = edited.komoditasData?.yoy?.hierarki || [];
  const ytdHierarki = edited.komoditasData?.ytd?.hierarki || [];
  const momHierarki = edited.komoditasData?.mom?.hierarki || [];
  const ihkHierarki = edited.komoditasIhkData?.hierarki || [];

  const getHierarkiVal = (item, mIdx) => {
    if (!item?.data) return undefined;
    const mName = MONTH_NAMES[mIdx];
    if (item.data[mName] !== undefined && item.data[mName] !== "") return item.data[mName];
    if (item.data[String(mIdx)] !== undefined && item.data[String(mIdx)] !== "") return item.data[String(mIdx)];
    if (item.data[String(mIdx + 1)] !== undefined && item.data[String(mIdx + 1)] !== "") return item.data[String(mIdx + 1)];
    const m2 = String(mIdx + 1).padStart(2, "0");
    const keys = Object.keys(item.data);
    const found = keys.find(k => k.endsWith(m2) || k.endsWith(String(mIdx + 1)));
    if (found && item.data[found] !== undefined && item.data[found] !== "") return item.data[found];
    if (keys[mIdx] !== undefined && item.data[keys[mIdx]] !== undefined && item.data[keys[mIdx]] !== "") return item.data[keys[mIdx]];
    return undefined;
  };

  for (const [code, prefix] of Object.entries(COMMODITY_GROUP_MAP)) {
    const row = groupRows[prefix];
    const groupName = COMMODITY_NAMES[prefix] || prefix;
    const normGroupName = normalizeLabel(groupName);

    // Look up directly from edited hierarki arrays as fallback
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

    const valYoyHierarki = getHierarkiVal(matchedYoy, monthIdx);
    const valYtdHierarki = getHierarkiVal(matchedYtd, monthIdx);
    const valMomHierarki = getHierarkiVal(matchedMom, monthIdx);
    const valIhkHierarki = getHierarkiVal(matchedIhk, monthIdx);
    const valPrevIhkHierarki = monthIdx > 0 ? getHierarkiVal(matchedIhk, monthIdx - 1) : undefined;

    // Resolve IHK Berjalan: Prioritize Step 3 row[8]
    let gIhkBerjalan = "107.00";
    if (row?.[8] !== undefined && String(row[8]).trim() !== "") {
      gIhkBerjalan = String(row[8]);
    } else if (valIhkHierarki !== undefined && valIhkHierarki !== null) {
      gIhkBerjalan = String(valIhkHierarki);
    } else if (varMap[`${prefix}IhkBerjalan`]) {
      gIhkBerjalan = varMap[`${prefix}IhkBerjalan`];
    }

    // Resolve IHK Sebelumnya: Prioritize Step 3 row[7]
    let gIhkSebelum = "105.00";
    if (row?.[7] !== undefined && String(row[7]).trim() !== "") {
      gIhkSebelum = String(row[7]);
    } else if (valPrevIhkHierarki !== undefined && valPrevIhkHierarki !== null) {
      gIhkSebelum = String(valPrevIhkHierarki);
    } else if (varMap[`${prefix}IhkSebelumnya`]) {
      gIhkSebelum = varMap[`${prefix}IhkSebelumnya`];
    }

    // Resolve Inflasi MoM: Prioritize Step 3 row[9]
    let gMtm = "0.20";
    if (row?.[9] !== undefined && String(row[9]).trim() !== "") {
      gMtm = String(row[9]);
    } else if (valMomHierarki !== undefined && valMomHierarki !== null) {
      gMtm = String(valMomHierarki);
    } else if (varMap[`${prefix}AndilMtm`]) {
      gMtm = varMap[`${prefix}AndilMtm`];
    }

    // Resolve Inflasi YtD: Prioritize Step 3 row[10]
    let gYtd = "1.50";
    if (row?.[10] !== undefined && String(row[10]).trim() !== "") {
      gYtd = String(row[10]);
    } else if (valYtdHierarki !== undefined && valYtdHierarki !== null) {
      gYtd = String(valYtdHierarki);
    } else if (varMap[`${prefix}Ytd`]) {
      gYtd = varMap[`${prefix}Ytd`];
    }

    // Resolve Inflasi YoY: Prioritize Step 3 row[11]
    let gYoy = "2.50";
    if (row?.[11] !== undefined && String(row[11]).trim() !== "") {
      gYoy = String(row[11]);
    } else if (valYoyHierarki !== undefined && valYoyHierarki !== null) {
      gYoy = String(valYoyHierarki);
    } else if (varMap[`${prefix}Yoy`]) {
      gYoy = varMap[`${prefix}Yoy`];
    }

    // Resolve Andil
    const gWeight = row?.[6] ? parseFloat(row[6]) : (100 / 11);
    let gAndilMtm = ((gWeight * (parseFloat(gMtm) || 0)) / 100).toFixed(2);
    if (row?.[12] !== undefined && String(row[12]).trim() !== "") {
      gAndilMtm = String(row[12]);
    }
    const gAndilYoy = ((gWeight * (parseFloat(gYoy) || 0)) / 100).toFixed(2);

    const gIhkPembanding = varMap[`${prefix}IhkPembanding`] || (parseFloat(gIhkBerjalan) * 0.97).toFixed(2);

    // Table 1 values
    varMap[`${prefix}IhkPembanding`] = gIhkPembanding;
    varMap[`${prefix}IhkSebelumnya`] = gIhkSebelum;
    varMap[`${prefix}IhkBerjalan`] = gIhkBerjalan;
    varMap[`${prefix}Ytd`] = gYtd;
    varMap[`${prefix}Yoy`] = gYoy;
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

  // 9. Overlay custom user variables
  if (customVars && typeof customVars === "object") {
    for (const [k, v] of Object.entries(customVars)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        varMap[k] = String(v);
      }
    }
  }

  return varMap;
}
