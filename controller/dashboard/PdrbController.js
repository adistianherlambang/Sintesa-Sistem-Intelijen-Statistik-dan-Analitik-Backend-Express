import APIDataBPS from "../../db/models/APIDataBPS.js";
import { findRegionByDataset } from "./helpers.js";

/**
 * Helper: Cari region pada array vervar PDRB.
 * Mendukung pencarian via helper findRegionByDataset maupun perbandingan nama kota langsung (termasuk penanganan KOTA/KABUPATEN).
 */
export const findRegionInVervar = (vervar, searchName) => {
  if (!searchName || !vervar) return null;

  // 1. Coba pencarian dengan findRegionByDataset (inflasi / ihk)
  const regionFromHelper =
    findRegionByDataset(vervar, searchName, "inflasi") ||
    findRegionByDataset(vervar, searchName, "ihk_komoditas");
  if (regionFromHelper) return regionFromHelper;

  const clean = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const searchClean = clean(searchName);
  const strip = (str) => str.replace(/^(KOTA|KABUPATEN|KAB)/g, "");
  const searchStripped = strip(searchClean);

  // 2. Match persis setelah di-clean
  let found = vervar.find((v) => clean(v.label) === searchClean);
  if (found) return found;

  // 3. Match pencarian tanpa prefix KOTA/KABUPATEN/KAB
  found = vervar.find((v) => clean(v.label) === searchStripped);
  if (found) return found;

  // 4. Match label vervar tanpa prefix KOTA/KABUPATEN/KAB
  found = vervar.find((v) => strip(clean(v.label)) === searchStripped);
  if (found) return found;

  // 5. Fallback includes
  found = vervar.find(
    (v) =>
      clean(v.label).includes(searchStripped) ||
      searchStripped.includes(clean(v.label)),
  );
  return found || null;
};

/**
 * Pure function: Dapatkan data PDRB berdasarkan varVal dan kota
 * @param {String} kota - Nama kota
 * @param {Number} varVal - Kode variabel (2773, 2774, 2775, 2776)
 * @returns {Object} Response data
 */
export const getPdrbByKota = async (kota, varVal = 2773) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const doc = await APIDataBPS.findOne({
    "var.val": Number(varVal),
  })
    .select("var turvar vervar tahun turtahun datacontent prevYear prev2Year")
    .lean();

  if (!doc) {
    throw new Error(`data PDRB (${varVal}) tidak ditemukan`);
  }

  const pdrbVar = (doc.var &&
    doc.var.find((item) => item.val === Number(varVal))) ||
    doc.var?.[0] || { val: Number(varVal), label: "PDRB" };

  const region = findRegionInVervar(doc.vervar, kota);
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const regionVal = region.val.toString();
  const result = [];
  const documentSection = doc.datacontent || {};

  const turvarMap = new Map((doc.turvar || []).map((t) => [t.val, t.label]));
  const tahunMap = new Map((doc.tahun || []).map((t) => [t.val, t.label]));
  const turtahunMap = new Map(
    (doc.turtahun || []).map((t) => [t.val, t.label]),
  );

  for (const key in documentSection) {
    if (key.startsWith(regionVal)) {
      const regL = regionVal.length;
      const turvarVal = Number(key.slice(regL + 4, regL + 8));
      const tahunVal = Number(key.slice(regL + 8, regL + 11));
      const turtahunVal = Number(key.slice(regL + 11));

      result.push({
        key,
        value: documentSection[key],
        turvarVal,
        turvarLabel: turvarMap.get(turvarVal) || "",
        tahunVal,
        tahunLabel: tahunMap.get(tahunVal) || "",
        turtahunVal,
        turtahunLabel: turtahunMap.get(turtahunVal) || "",
      });
    }
  }

  const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));

  return {
    kota: region.label,
    var: pdrbVar,
    turvar: doc.turvar || [],
    regionVal,
    total: result.length,
    data: sorted,
    prevYear: [],
    prev2Year: [],
  };
};

/**
 * Pure function: Dapatkan dokumen PDRB lengkap berdasarkan varVal
 * @param {Number} varVal - Kode variabel (2773, 2774, 2775, 2776)
 * @returns {Object} Dokumen PDRB
 */
export const getAllPdrbByVar = async (varVal = 2773) => {
  const doc = await APIDataBPS.findOne({
    "var.val": Number(varVal),
  }).lean();

  if (!doc) {
    throw new Error(`data PDRB (${varVal}) tidak ditemukan`);
  }

  return { doc };
};

/**
 * Pure function: Dapatkan seluruh dokumen PDRB (2773, 2774, 2775, 2776)
 * @returns {Object} List dokumen PDRB
 */
export const getAllPdrb = async () => {
  const docs = await APIDataBPS.find({
    "var.val": { $in: [2773, 2774, 2775, 2776] },
  }).lean();

  if (!docs || docs.length === 0) {
    throw new Error("data PDRB tidak ditemukan");
  }

  return { docs };
};

// ================= PER VARIABEL SPECIFIC FUNCTIONS =================

// 1. var 2773: PDRB Pengeluaran ADHK (Harga Konstan)
export const getPdrbPengeluaranAdhkByKota = (kota) => getPdrbByKota(kota, 2773);
export const getAllPdrbPengeluaranAdhk = () => getAllPdrbByVar(2773);

// 2. var 2774: PDRB Pengeluaran ADHB (Harga Berlaku)
export const getPdrbPengeluaranAdhbByKota = (kota) => getPdrbByKota(kota, 2774);
export const getAllPdrbPengeluaranAdhb = () => getAllPdrbByVar(2774);

// 3. var 2775: PDRB Lapangan Usaha ADHK (Harga Konstan)
export const getPdrbLapanganUsahaAdhkByKota = (kota) =>
  getPdrbByKota(kota, 2775);
export const getAllPdrbLapanganUsahaAdhk = () => getAllPdrbByVar(2775);

// 4. var 2776: PDRB Lapangan Usaha ADHB (Harga Berlaku)
export const getPdrbLapanganUsahaAdhbByKota = (kota) =>
  getPdrbByKota(kota, 2776);
export const getAllPdrbLapanganUsahaAdhb = () => getAllPdrbByVar(2776);
