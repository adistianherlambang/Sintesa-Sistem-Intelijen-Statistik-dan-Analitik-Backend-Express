import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getKomoditasByKota,
  getKomoditasYoyByKota,
  getKomoditasYtdByKota,
} from "../controller/dashboard/komoditasController.js";
import { getIhkByKota } from "../controller/dashboard/ihkController.js";
import {
  getInflasiByKota,
  getInflasiYoyByKota,
  getInflasiYtdByKota,
} from "../controller/dashboard/inflasiController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/**
 * Format angka ke format bahasa Indonesia (koma untuk desimal)
 */
export const toIndoNum = (val, decimals = 2) => {
  if (val === undefined || val === null || val === "") return "0,00";
  if (typeof val === "string" && val.includes(",")) return val;
  const num = parseFloat(String(val).replace(",", "."));
  if (isNaN(num)) return "0,00";
  return num.toFixed(decimals).replace(".", ",");
};

/**
 * Normalisasi string nama kelompok/komoditas untuk pencocokan kunci yang fleksibel
 */
export const normalizeGroupName = (str) => {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

/**
 * Membaca data bobot dari backend/json/bobot.json
 */
export const loadBobotData = () => {
  const bobotPath = path.resolve(__dirname, "../json/bobot.json");
  if (!fs.existsSync(bobotPath)) {
    console.warn("⚠ File bobot.json tidak ditemukan:", bobotPath);
    return {};
  }
  const content = JSON.parse(fs.readFileSync(bobotPath, "utf8"));
  const map = {};
  if (Array.isArray(content.bobot)) {
    content.bobot.forEach((item) => {
      map[normalizeGroupName(item.kelompok)] = item.bobot;
    });
  }
  return map;
};

/**
 * Pencocokan kunci kelompok presisi
 */
export const matchGroupKey = (label) => {
  const norm = normalizeGroupName(label);
  if (norm.includes("tembakau") || (norm.includes("makanan") && norm.includes("minuman") && !norm.includes("restoran"))) return "makanan";
  if (norm.includes("pakaian") || norm.includes("alaskaki")) return "pakaian";
  if (norm.includes("perumahan") || norm.includes("bahanbakar")) return "perumahan";
  if (norm.includes("perlengkapan") || norm.includes("pemeliharaan")) return "perlengkapan";
  if (norm.includes("kesehatan")) return "kesehatan";
  if (norm.includes("transportasi")) return "transportasi";
  if (norm.includes("informasi") || norm.includes("komunikasi")) return "informasi";
  if (norm.includes("rekreasi") || norm.includes("olahraga")) return "rekreasi";
  if (norm.includes("pendidikan")) return "pendidikan";
  if (norm.includes("restoran") || (norm.includes("penyediaan") && norm.includes("makanan"))) return "restoran";
  if (norm.includes("perawatan") || norm.includes("jasalainnya")) return "perawatan";
  return null;
};

/**
 * Format daftar nama komoditas pendorong/penghambat
 */
const formatCommodityList = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return "-";
  }
  const names = items.map((i) => i.name || i.label || i);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, dan ${names[names.length - 1]}`;
};

/**
 * Fungsi utama memproses data BPS dan menyusun dictionary placeholder
 */
export const processIdmlVariables = async (targetCityInput = "") => {
  let targetCity = "";
  if (typeof targetCityInput === "string") {
    targetCity = targetCityInput;
  } else if (targetCityInput && typeof targetCityInput === "object") {
    targetCity =
      targetCityInput.body?.kota ||
      targetCityInput.body?.city ||
      targetCityInput.kota ||
      targetCityInput.city ||
      "";
  }

  const bobotMap = loadBobotData();

  // 1. Fetch data MoM, YoY, YtD, IHK dari controller BPS
  const [
    komoditasMomData,
    komoditasYoyData,
    komoditasYtdData,
    ihkData,
    inflasiMoMData,
    inflasiYtdData,
    inflasiYoyData,
  ] = await Promise.all([
    getKomoditasByKota(targetCity).catch(() => null),
    getKomoditasYoyByKota(targetCity).catch(() => null),
    getKomoditasYtdByKota(targetCity).catch(() => null),
    getIhkByKota(targetCity).catch(() => null),
    getInflasiByKota(targetCity).catch(() => null),
    getInflasiYtdByKota(targetCity).catch(() => null),
    getInflasiYoyByKota(targetCity).catch(() => null),
  ]);

  const now = new Date();
  const currentYear = now.getFullYear();

  let monthIndex = 5; // Default Juni (index 5)
  if (inflasiMoMData && Array.isArray(inflasiMoMData.data) && inflasiMoMData.data.length > 0) {
    const lastItem = inflasiMoMData.data[inflasiMoMData.data.length - 1];
    const keyStr = String(lastItem.key);
    const mNum = parseInt(keyStr.slice(-1), 10) || parseInt(keyStr.slice(-2), 10);
    if (mNum >= 1 && mNum <= 12) monthIndex = mNum - 1;
  }

  const currentMonth = months[monthIndex];
  const prevMonthIndex = (monthIndex - 1 + 12) % 12;
  const prevMonthName = months[prevMonthIndex];
  const prevYear = currentYear - 1;
  const twoYearsAgo = currentYear - 2;

  // Helper untuk membaca nilai berdasarkan index bulan dari array dataset BPS
  const getValueForMonth = (dataArray, mIndex) => {
    if (!Array.isArray(dataArray) || dataArray.length === 0) return 0;
    const targetMonthNum = mIndex + 1; // 1-12
    const found = dataArray.find((item) => {
      if (!item || item.key === undefined) return false;
      const keyStr = String(item.key);
      const mNum = parseInt(keyStr.slice(-2), 10);
      if (mNum === targetMonthNum) return true;
      const mNumSingle = parseInt(keyStr.slice(-1), 10);
      return mNumSingle === targetMonthNum;
    });
    if (found) return parseFloat(found.value) || 0;
    const last = dataArray[dataArray.length - 1];
    return last ? parseFloat(last.value) || 0 : 0;
  };

  // Nilai inflasi & IHK umum 3 Periode (Now, PrevYear, Prev2Year)
  const umumMoMVal = parseFloat(inflasiMoMData?.dashboard?.now ?? 0.29);
  const umumMoMValPrevYear = getValueForMonth(inflasiMoMData?.prevYear, monthIndex);
  const umumMoMValPrev2Year = getValueForMonth(inflasiMoMData?.prev2Year, monthIndex);

  const umumYtdVal = parseFloat(inflasiYtdData?.dashboard?.now ?? 1.91);
  const umumYtdValPrevYear = getValueForMonth(inflasiYtdData?.prevYear, monthIndex);
  const umumYtdValPrev2Year = getValueForMonth(inflasiYtdData?.prev2Year, monthIndex);

  const umumYoYVal = parseFloat(inflasiYoyData?.dashboard?.now ?? 3.07);
  const umumYoYValPrevYear = getValueForMonth(inflasiYoyData?.prevYear, monthIndex);
  const umumYoYValPrev2Year = getValueForMonth(inflasiYoyData?.prev2Year, monthIndex);

  const umumIhkBerjalanVal = parseFloat(ihkData?.dashboard?.now ?? 110.73);
  const umumIhkPrevYearVal = getValueForMonth(ihkData?.prevYear, monthIndex);
  const umumIhkPrev2YearVal = getValueForMonth(ihkData?.prev2Year, monthIndex);
  const umumIhkSebelumnyaVal = parseFloat(ihkData?.dashboard?.then ?? 110.41);
  const umumIhkPembandingVal = Number((umumIhkBerjalanVal / (1 + umumYoYVal / 100)).toFixed(2));

  const bobotTotalUtama = 100.0;
  const umumAndilMtmVal = Number(((bobotTotalUtama * umumMoMVal) / 100).toFixed(2));
  const umumAndilYoyVal = Number(((bobotTotalUtama * umumYoYVal) / 100).toFixed(2));

  const statusKenaikanAtauPenurunan = umumMoMVal >= 0 ? "kenaikan harga" : "penurunan harga";
  const arahPerkembanganHarga = umumMoMVal >= 0 ? "kenaikan harga" : "penurunan harga";
  const arahPerubahanIhk = umumYoYVal >= 0 ? "kenaikan" : "penurunan";

  // Map variabel dasar
  const variables = {
    bulan: currentMonth,
    tahun: String(currentYear),
    bulanTahun: `${currentMonth} ${currentYear}`,
    bulanDanTahun: `${currentMonth} ${currentYear}`,
    tanggalBulanTahunSekarang: `1 ${currentMonth} ${currentYear}`,
    wilayah: targetCity,
    namaWilayah: targetCity,
    namaKota: targetCity,
    "namaKota.upperCase()": targetCity.toUpperCase(),
    "namaKota.uppercase()": targetCity.toUpperCase(),
    instansi: `Badan Pusat Statistik ${targetCity}`,

    arahPerkembanganHarga,
    arahPerubahanIhk,
    statusKenaikanAtauPenurunan,

    bulanTahunSebelumnya: `${currentMonth} ${prevYear}`,
    bulanTahunSebelumnya1: `${currentMonth} ${prevYear}`,
    bulanTahunSebelumnya2: `${currentMonth} ${twoYearsAgo}`,

    periodePembanding: `${currentMonth} ${twoYearsAgo}`,
    periodeSebelumnya: `${prevMonthName} ${currentYear}`,
    periodeBerjalan: `${currentMonth} ${currentYear}`,

    tahunAwal: String(twoYearsAgo),
    tahunAkhir: String(currentYear),
    tahun1: String(twoYearsAgo),
    tahun2: String(prevYear),
    tahun3: String(currentYear),

    // Nilai umum (Now, PrevYear, Prev2Year)
    inflasiMoM: toIndoNum(umumMoMVal),
    inflasiMtM: toIndoNum(umumMoMVal),
    inflasiMoMNow: toIndoNum(umumMoMVal),
    inflasiMoMPrevYear: toIndoNum(umumMoMValPrevYear),
    inflasiMoMPrev2Year: toIndoNum(umumMoMValPrev2Year),

    inflasiYoy: toIndoNum(umumYoYVal),
    inflasiYoY: toIndoNum(umumYoYVal),
    inflasiYoYNow: toIndoNum(umumYoYVal),
    inflasiYoYPrevYear: toIndoNum(umumYoYValPrevYear),
    inflasiYoYPrev2Year: toIndoNum(umumYoYValPrev2Year),

    inflasiYtd: toIndoNum(umumYtdVal),
    inflasiYtD: toIndoNum(umumYtdVal),
    inflasiYtdNow: toIndoNum(umumYtdVal),
    inflasiYtdPrevYear: toIndoNum(umumYtdValPrevYear),
    inflasiYtdPrev2Year: toIndoNum(umumYtdValPrev2Year),

    ihkSaatIni: toIndoNum(umumIhkBerjalanVal),
    ihkTahunSebelumnya: toIndoNum(umumIhkPembandingVal),
    ihkSekarang: toIndoNum(umumIhkBerjalanVal),
    ihkNow: toIndoNum(umumIhkBerjalanVal),
    ihkPrevYear: toIndoNum(umumIhkPrevYearVal),
    ihkPrev2Year: toIndoNum(umumIhkPrev2YearVal),

    umumIhkPembanding: toIndoNum(umumIhkPembandingVal),
    umumIhkSebelumnya: toIndoNum(umumIhkSebelumnyaVal),
    umumIhkBerjalan: toIndoNum(umumIhkBerjalanVal),
    umumYtd: toIndoNum(umumYtdVal),
    umumYoy: toIndoNum(umumYoYVal),
    umumAndilMtm: toIndoNum(umumAndilMtmVal),
    umumAndilYoy: toIndoNum(umumAndilYoyVal),

    // Metadata kontak BPS
    alamat: "Jl. BPS No. 1",
    noTelp: "(0341) 123456",
    website: `https://${targetCity.toLowerCase().replace(/[^a-z0-9]/g, "")}.bps.go.id`,
    email: `bps${targetCity.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  };

  const groupKeys = [
    "makanan",
    "pakaian",
    "perumahan",
    "perlengkapan",
    "kesehatan",
    "transportasi",
    "informasi",
    "rekreasi",
    "pendidikan",
    "restoran",
    "perawatan",
  ];

  const groupProcessedData = {};
  groupKeys.forEach((k) => {
    groupProcessedData[k] = {
      label: "",
      bobot: 5.0,
      momNow: 0.0,
      momPrevYear: 0.0,
      momPrev2Year: 0.0,
      yoyNow: 0.0,
      yoyPrevYear: 0.0,
      yoyPrev2Year: 0.0,
      ytdNow: 0.0,
      ytdPrevYear: 0.0,
      ytdPrev2Year: 0.0,
      mom: 0.0,
      yoy: 0.0,
      ytd: 0.0,
      ihkBerjalan: umumIhkBerjalanVal,
      ihkSebelumnya: umumIhkSebelumnyaVal,
      ihkPembanding: umumIhkPembandingVal,
      andilMtm: 0.0,
      andilYoy: 0.0,
      subMom: [],
      subYoy: [],
      subYtd: [],
    };
  });

  const fillGroupData = (dataList, valField, subField) => {
    if (Array.isArray(dataList)) {
      dataList.forEach((item) => {
        const k = matchGroupKey(item.label || item.nama);
        if (k && groupProcessedData[k]) {
          groupProcessedData[k].label = item.label || item.nama;
          const norm = normalizeGroupName(item.label || item.nama);
          if (bobotMap[norm]) {
            groupProcessedData[k].bobot = bobotMap[norm];
          }
          groupProcessedData[k][valField] = parseFloat(item.value) || 0.0;
          if (subField) {
            groupProcessedData[k][subField] = Array.isArray(item.sub) ? item.sub : [];
          }
        }
      });
    }
  };

  // Populate 3-year data for groups
  fillGroupData(komoditasMomData?.hierarki, "momNow", "subMom");
  fillGroupData(komoditasYoyData?.hierarki, "yoyNow", "subYoy");
  fillGroupData(komoditasYtdData?.hierarki, "ytdNow", "subYtd");

  fillGroupData(komoditasMomData?.prevYear || komoditasMomData?.prevYearList, "momPrevYear", null);
  fillGroupData(komoditasYoyData?.prevYear || komoditasYoyData?.prevYearList, "yoyPrevYear", null);
  fillGroupData(komoditasYtdData?.prevYear || komoditasYtdData?.prevYearList, "ytdPrevYear", null);

  fillGroupData(komoditasMomData?.prev2Year || komoditasMomData?.prev2YearList, "momPrev2Year", null);
  fillGroupData(komoditasYoyData?.prev2Year || komoditasYoyData?.prev2YearList, "yoyPrev2Year", null);
  fillGroupData(komoditasYtdData?.prev2Year || komoditasYtdData?.prev2YearList, "ytdPrev2Year", null);

  // Synchronize backward-compatible group values & compute andil/IHK
  groupKeys.forEach((k) => {
    const data = groupProcessedData[k];
    data.mom = data.momNow;
    data.yoy = data.yoyNow;
    data.ytd = data.ytdNow;

    data.andilMtm = Number(((data.bobot * data.mom) / 100).toFixed(2));
    data.andilYoy = Number(((data.bobot * data.yoy) / 100).toFixed(2));

    const ihkNowGroup = Number((umumIhkBerjalanVal + data.mom).toFixed(2));
    const ihkPrevMonthGroup = Number((ihkNowGroup / (1 + data.mom / 100)).toFixed(2));
    const ihkPrevYearGroup = Number((ihkNowGroup / (1 + data.yoy / 100)).toFixed(2));

    data.ihkBerjalan = ihkNowGroup;
    data.ihkSebelumnya = ihkPrevMonthGroup;
    data.ihkPembanding = ihkPrevYearGroup;

    // Populate placeholder variabel kelompok 3 Periode
    variables[`${k}IhkPembanding`] = toIndoNum(data.ihkPembanding);
    variables[`${k}IhkSebelumnya`] = toIndoNum(data.ihkSebelumnya);
    variables[`${k}IhkBerjalan`] = toIndoNum(data.ihkBerjalan);

    variables[`${k}Ytd`] = toIndoNum(data.ytdNow);
    variables[`${k}YtdNow`] = toIndoNum(data.ytdNow);
    variables[`${k}YtdPrevYear`] = toIndoNum(data.ytdPrevYear);
    variables[`${k}YtdPrev2Year`] = toIndoNum(data.ytdPrev2Year);

    variables[`${k}Yoy`] = toIndoNum(data.yoyNow);
    variables[`${k}YoyNow`] = toIndoNum(data.yoyNow);
    variables[`${k}YoyPrevYear`] = toIndoNum(data.yoyPrevYear);
    variables[`${k}YoyPrev2Year`] = toIndoNum(data.yoyPrev2Year);

    variables[`${k}Mom`] = toIndoNum(data.momNow);
    variables[`${k}MomNow`] = toIndoNum(data.momNow);
    variables[`${k}MomPrevYear`] = toIndoNum(data.momPrevYear);
    variables[`${k}MomPrev2Year`] = toIndoNum(data.momPrev2Year);

    variables[`${k}AndilMtm`] = toIndoNum(data.andilMtm);
    variables[`${k}AndilYoy`] = toIndoNum(data.andilYoy);
  });

  // Placeholder spesifik teks paragraf per kelompok
  variables["kelompokMakanan"] = "makanan, minuman, dan tembakau";
  variables["indeksMakananYoy"] = toIndoNum(groupProcessedData["makanan"].yoy);
  variables["andilMakananYoy"] = toIndoNum(groupProcessedData["makanan"].andilYoy);

  variables["kelompokPakaian"] = "pakaian dan alas kaki";
  variables["penurunanPakaianYoy"] = toIndoNum(Math.abs(groupProcessedData["pakaian"].yoy));
  variables["andilDeflasiPakaianYoy"] = toIndoNum(Math.abs(groupProcessedData["pakaian"].andilYoy));

  variables["kelompokPerumahan"] = "perumahan, air, listrik, dan bahan bakar rumah tangga";
  variables["kelompokPerumahanLainnya"] = "perumahan, air, listrik, dan bahan bakar rumah tangga";
  variables["indeksPerumahanYoy"] = toIndoNum(groupProcessedData["perumahan"].yoy);
  variables["andilPerumahanYoy"] = toIndoNum(groupProcessedData["perumahan"].andilYoy);

  variables["kelompokPerlengkapanRumahTangga"] = "perlengkapan, peralatan, dan pemeliharaan rutin rumah tangga";
  variables["penurunanPerlengkapanRumahTanggaYoy"] = toIndoNum(Math.abs(groupProcessedData["perlengkapan"].yoy));
  variables["andilDeflasiPerlengkapanRumahTanggaYoy"] = toIndoNum(Math.abs(groupProcessedData["perlengkapan"].andilYoy));

  variables["kelompokKesehatan"] = "kesehatan";
  variables["indeksKesehatanYoy"] = toIndoNum(groupProcessedData["kesehatan"].yoy);
  variables["andilKesehatanYoy"] = toIndoNum(groupProcessedData["kesehatan"].andilYoy);

  variables["kelompokTransportasi"] = "transportasi";
  variables["indeksTransportasiYoy"] = toIndoNum(groupProcessedData["transportasi"].yoy);
  variables["andilTransportasiYoy"] = toIndoNum(groupProcessedData["transportasi"].andilYoy);

  variables["kelompokInformasiKomunikasi"] = "informasi, komunikasi, dan jasa keuangan";
  variables["penurunanInformasiKomunikasiYoy"] = toIndoNum(Math.abs(groupProcessedData["informasi"].yoy));
  variables["andilDeflasiInformasiKomunikasiYoy"] = toIndoNum(Math.abs(groupProcessedData["informasi"].andilYoy));

  variables["kelompokRekreasi"] = "rekreasi, olahraga, dan budaya";
  variables["indeksRekreasiYoy"] = toIndoNum(groupProcessedData["rekreasi"].yoy);
  variables["andilRekreasiYoy"] = toIndoNum(groupProcessedData["rekreasi"].andilYoy);

  variables["kelompokPendidikan"] = "pendidikan";
  variables["penurunanPendidikanYoy"] = toIndoNum(Math.abs(groupProcessedData["pendidikan"].yoy));
  variables["andilDeflasiPendidikanYoy"] = toIndoNum(Math.abs(groupProcessedData["pendidikan"].andilYoy));

  variables["kelompokRestoran"] = "penyediaan makanan dan minuman/restoran";
  variables["indeksRestoranYoy"] = toIndoNum(groupProcessedData["restoran"].yoy);
  variables["andilRestoranYoy"] = toIndoNum(groupProcessedData["restoran"].andilYoy);

  variables["kelompokPerawatanPribadi"] = "perawatan pribadi dan jasa lainnya";
  variables["indeksPerawatanPribadiYoy"] = toIndoNum(groupProcessedData["perawatan"].yoy);
  variables["andilPerawatanPribadiYoy"] = toIndoNum(groupProcessedData["perawatan"].andilYoy);

  // Komoditas pendorong & penghambat
  const topMom = komoditasMomData?.top5Mom || komoditasMomData?.topMom || [];
  const topYoy = komoditasYoyData?.top5Yoy || komoditasYoyData?.topYoy || komoditasMomData?.top5Yoy || [];

  const inflasiMtmItems = topMom.filter((i) => (parseFloat(i.value) || 0) > 0);
  const deflasiMtmItems = topMom.filter((i) => (parseFloat(i.value) || 0) < 0);
  const inflasiYoyItems = topYoy.filter((i) => (parseFloat(i.value) || 0) > 0);
  const deflasiYoyItems = topYoy.filter((i) => (parseFloat(i.value) || 0) < 0);

  variables["komoditasInflasiMtm"] = formatCommodityList(
    inflasiMtmItems.length > 0 ? inflasiMtmItems : [{ name: "beras" }, { name: "telur ayam ras" }, { name: "cabai rawit" }]
  );
  variables["komoditasDeflasiMtm"] = formatCommodityList(
    deflasiMtmItems.length > 0 ? deflasiMtmItems : [{ name: "bawang merah" }, { name: "daging ayam ras" }]
  );
  variables["komoditasInflasiYoy"] = formatCommodityList(
    inflasiYoyItems.length > 0 ? inflasiYoyItems : [{ name: "beras" }, { name: "daging ayam ras" }, { name: "emas perhiasan" }]
  );
  variables["komoditasDeflasiYoy"] = formatCommodityList(
    deflasiYoyItems.length > 0 ? deflasiYoyItems : [{ name: "bawang merah" }, { name: "minyak goreng" }]
  );

  // Values bulanan nyata 3 tahun (Story_u15d2.xml)
  monthNamesShort.forEach((mShort, idx) => {
    const keyPrefix = mShort.toLowerCase();
    const valTahun1 = getValueForMonth(inflasiMoMData?.prev2Year, idx);
    const valTahun2 = getValueForMonth(inflasiMoMData?.prevYear, idx);
    const valTahun3 = getValueForMonth(inflasiMoMData?.data, idx);

    variables[`${keyPrefix}Tahun1`] = toIndoNum(valTahun1);
    variables[`${keyPrefix}Tahun2`] = toIndoNum(valTahun2);
    variables[`${keyPrefix}Tahun3`] = toIndoNum(valTahun3);
  });

  return {
    variables,
    raw: {
      targetCity,
      currentMonth,
      currentYear,
      years: {
        now: currentYear,
        prevYear: prevYear,
        prev2Year: twoYearsAgo,
      },
      ihkMom: {
        now: ihkData?.data || [],
        prevYear: ihkData?.prevYear || [],
        prev2Year: ihkData?.prev2Year || [],
      },
      inflasiMom: {
        now: inflasiMoMData?.data || [],
        prevYear: inflasiMoMData?.prevYear || [],
        prev2Year: inflasiMoMData?.prev2Year || [],
      },
      inflasiYoy: {
        now: inflasiYoyData?.data || [],
        prevYear: inflasiYoyData?.prevYear || [],
        prev2Year: inflasiYoyData?.prev2Year || [],
      },
      inflasiYtd: {
        now: inflasiYtdData?.data || [],
        prevYear: inflasiYtdData?.prevYear || [],
        prev2Year: inflasiYtdData?.prev2Year || [],
      },
      komoditasMom: {
        now: komoditasMomData?.hierarki || [],
        prevYear: komoditasMomData?.prevYear || komoditasMomData?.prevYearList || [],
        prev2Year: komoditasMomData?.prev2Year || komoditasMomData?.prev2YearList || [],
      },
      komoditasYoy: {
        now: komoditasYoyData?.hierarki || [],
        prevYear: komoditasYoyData?.prevYear || komoditasYoyData?.prevYearList || [],
        prev2Year: komoditasYoyData?.prev2Year || komoditasYoyData?.prev2YearList || [],
      },
      komoditasYtd: {
        now: komoditasYtdData?.hierarki || [],
        prevYear: komoditasYtdData?.prevYear || komoditasYtdData?.prevYearList || [],
        prev2Year: komoditasYtdData?.prev2Year || komoditasYtdData?.prev2YearList || [],
      },
      komoditasMomData,
      komoditasYoyData,
      komoditasYtdData,
      ihkData,
      inflasiMoMData,
      inflasiYtdData,
      inflasiYoyData,
      groupProcessedData,
      hargaBI: komoditasMomData?.hargaBI || komoditasMomData?.harga_bi || [],
    },
  };
};
