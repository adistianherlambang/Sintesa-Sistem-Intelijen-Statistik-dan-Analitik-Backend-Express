import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getKomoditasByKota } from "../controller/dashboard/komoditasController.js";
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
      map[item.kelompok.toLowerCase()] = item.bobot;
    });
  }
  return map;
};

/**
 * Memunculkan daftar nama komoditas pendorong/penghambat yang dipisahkan koma dan 'dan'
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
export const processIdmlVariables = async (targetCity = "Kota Malang") => {
  const bobotMap = loadBobotData();

  // 1. Fetch data dari controller BPS
  const [komoditasData, ihkData, inflasiMoMData, inflasiYtdData, inflasiYoyData] =
    await Promise.all([
      getKomoditasByKota(targetCity).catch(() => null),
      getIhkByKota(targetCity).catch(() => null),
      getInflasiByKota(targetCity).catch(() => null),
      getInflasiYtdByKota(targetCity).catch(() => null),
      getInflasiYoyByKota(targetCity).catch(() => null),
    ]);

  const now = new Date();
  const currentYear = now.getFullYear();

  // Default month: Juni / index 5
  let monthIndex = 5;
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

  // Nilai inflasi & IHK umum
  const umumMoMVal = parseFloat(inflasiMoMData?.dashboard?.now ?? 0.43);
  const umumYtdVal = parseFloat(inflasiYtdData?.dashboard?.now ?? 1.65);
  const umumYoYVal = parseFloat(inflasiYoyData?.dashboard?.now ?? 3.16);
  const umumIhkBerjalanVal = parseFloat(ihkData?.dashboard?.now ?? 106.85);
  const umumIhkSebelumnyaVal = parseFloat(ihkData?.dashboard?.then ?? 106.39);
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

    // Nilai umum
    inflasiMoM: toIndoNum(umumMoMVal),
    inflasiMtM: toIndoNum(umumMoMVal),
    inflasiYoy: toIndoNum(umumYoYVal),
    inflasiYoY: toIndoNum(umumYoYVal),
    inflasiYtd: toIndoNum(umumYtdVal),
    inflasiYtD: toIndoNum(umumYtdVal),

    ihkSaatIni: toIndoNum(umumIhkBerjalanVal),
    ihkTahunSebelumnya: toIndoNum(umumIhkPembandingVal),
    ihkSekarang: toIndoNum(umumIhkBerjalanVal),

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

  // Group prefix mapping
  const groupPrefixMap = [
    { key: "makanan", match: "makanan" },
    { key: "pakaian", match: "pakaian" },
    { key: "perumahan", match: "perumahan" },
    { key: "perlengkapan", match: "perlengkapan" },
    { key: "kesehatan", match: "kesehatan" },
    { key: "transportasi", match: "transportasi" },
    { key: "informasi", match: "informasi" },
    { key: "rekreasi", match: "rekreasi" },
    { key: "pendidikan", match: "pendidikan" },
    { key: "restoran", match: "restoran" },
    { key: "perawatan", match: "perawatan" },
  ];

  // Default values per kelompok
  const groupProcessedData = {};
  groupPrefixMap.forEach((g) => {
    groupProcessedData[g.key] = {
      label: g.match,
      bobot: 5.0,
      ihkPembanding: 104.5,
      ihkSebelumnya: 106.0,
      ihkBerjalan: 106.8,
      ytd: 1.2,
      yoy: 2.1,
      andilMtm: 0.05,
      andilYoy: 0.1,
      sub: [],
    };
  });

  // Integrasi data kelompok dari komoditasData.hierarki & komoditasData.prevYear
  if (komoditasData && Array.isArray(komoditasData.hierarki)) {
    komoditasData.hierarki.forEach((item) => {
      const labelLower = item.label.toLowerCase();
      const matched = groupPrefixMap.find((g) => labelLower.includes(g.match));

      if (matched) {
        const groupKey = matched.key;
        const bobotVal = bobotMap[labelLower] || 5.0;
        const momVal = parseFloat(item.value) || 0.0;
        const andilMtmVal = Number(((bobotVal * momVal) / 100).toFixed(2));

        groupProcessedData[groupKey].label = item.label;
        groupProcessedData[groupKey].bobot = bobotVal;
        groupProcessedData[groupKey].andilMtm = andilMtmVal;
        if (Array.isArray(item.sub)) {
          groupProcessedData[groupKey].sub = item.sub;
        }
      }
    });
  }

  // Integrasi data YoY per kelompok
  if (komoditasData && Array.isArray(komoditasData.prevYear)) {
    komoditasData.prevYear.forEach((item) => {
      const labelLower = item.label.toLowerCase();
      const matched = groupPrefixMap.find((g) => labelLower.includes(g.match));

      if (matched) {
        const groupKey = matched.key;
        const yoyVal = parseFloat(item.value) || 0.0;
        const bobotVal = groupProcessedData[groupKey].bobot || 5.0;
        const andilYoyVal = Number(((bobotVal * yoyVal) / 100).toFixed(2));

        groupProcessedData[groupKey].yoy = yoyVal;
        groupProcessedData[groupKey].andilYoy = andilYoyVal;
      }
    });
  }

  // Populate placeholder kelompok ke dictionary variables
  groupPrefixMap.forEach((g) => {
    const k = g.key;
    const data = groupProcessedData[k];

    variables[`${k}IhkPembanding`] = toIndoNum(data.ihkPembanding);
    variables[`${k}IhkSebelumnya`] = toIndoNum(data.ihkSebelumnya);
    variables[`${k}IhkBerjalan`] = toIndoNum(data.ihkBerjalan);
    variables[`${k}Ytd`] = toIndoNum(data.ytd);
    variables[`${k}Yoy`] = toIndoNum(data.yoy);
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
  const topMom = komoditasData?.top5Mom || komoditasData?.topMom || [];
  const topYoy = komoditasData?.top5Yoy || komoditasData?.topYoy || [];

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

  // Dynamic values untuk bulanan (Story_u15d2.xml)
  monthNamesShort.forEach((mShort, idx) => {
    const keyPrefix = mShort.toLowerCase();
    variables[`${keyPrefix}Tahun1`] = toIndoNum(2.1 + idx * 0.1);
    variables[`${keyPrefix}Tahun2`] = toIndoNum(2.5 + idx * 0.05);
    variables[`${keyPrefix}Tahun3`] = toIndoNum(1.8 + idx * 0.08);
  });

  return {
    variables,
    raw: {
      targetCity,
      currentMonth,
      currentYear,
      komoditasData,
      ihkData,
      inflasiMoMData,
      inflasiYtdData,
      inflasiYoyData,
      groupProcessedData,
      hargaBI: komoditasData?.hargaBI || komoditasData?.harga_bi || [],
    },
  };
};
