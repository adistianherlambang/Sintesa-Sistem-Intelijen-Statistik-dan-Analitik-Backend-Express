import APIDataBPS from "../../db/models/APIDataBPS.js";
import { findRegionByDataset } from "./helpers.js";

/**
 * Helper: Cari region pada array vervar Demografi.
 * Mendukung pencarian via helper findRegionByDataset maupun perbandingan nama kota langsung (termasuk penanganan KOTA/KABUPATEN).
 */
export const findRegionInVervar = (vervar, searchName) => {
  if (!searchName || !vervar) return null;

  // 1. Coba pencarian dengan findRegionByDataset (inflasi / ihk)
  const regionFromHelper =
    findRegionByDataset(vervar, searchName, "inflasi") ||
    findRegionByDataset(vervar, searchName, "ihk_komoditas");
  if (regionFromHelper) return regionFromHelper;

  const clean = (str) =>
    str
      .toUpperCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^A-Z0-9]/g, "");
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
 * Pure function: Dapatkan data Demografi berdasarkan varVal dan kota
 * @param {String} kota - Nama kota
 * @param {Number} varVal - Kode variabel (2790, 2791, 2792, 621)
 * @returns {Object} Response data
 */
export const getDemografiByKota = async (kota, varVal = 2790) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const doc = await APIDataBPS.findOne({
    "var.val": Number(varVal),
  })
    .select("var turvar vervar tahun turtahun datacontent prevYear prev2Year")
    .lean();

  if (!doc) {
    throw new Error(`data Demografi (${varVal}) tidak ditemukan`);
  }

  const demoVar = (doc.var &&
    doc.var.find((item) => item.val === Number(varVal))) ||
    doc.var?.[0] || { val: Number(varVal), label: "Demografi" };

  const region = findRegionInVervar(doc.vervar, kota);
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const regionVal = region.val.toString();
  const result = [];
  const documentSection = doc.datacontent || {};

  const turvarMap = new Map(
    (doc.turvar || []).map((t) => [Number(t.val), t.label]),
  );
  const tahunMap = new Map(
    (doc.tahun || []).map((t) => [Number(t.val), t.label]),
  );
  const turtahunMap = new Map(
    (doc.turtahun || []).map((t) => [Number(t.val), t.label]),
  );

  for (const key in documentSection) {
    if (key.startsWith(regionVal)) {
      const regL = regionVal.length;
      const varStr = String(varVal);
      const varL = varStr.length;
      const remaining = key.slice(regL + varL);

      let turvarVal = 0;
      let tahunVal = 0;
      let turtahunVal = 0;

      if (remaining.length === 6) {
        turvarVal = Number(remaining.slice(0, 2));
        tahunVal = Number(remaining.slice(2, 5));
        turtahunVal = Number(remaining.slice(5));
      } else if (remaining.length === 5) {
        turvarVal = Number(remaining.slice(0, 1));
        tahunVal = Number(remaining.slice(1, 4));
        turtahunVal = Number(remaining.slice(4));
      }

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
    kota: region.label.replace(/<[^>]*>/g, ""),
    var: demoVar,
    turvar: doc.turvar || [],
    regionVal,
    total: result.length,
    data: sorted,
    prevYear: [],
    prev2Year: [],
  };
};

/**
 * Pure function: Dapatkan dokumen Demografi lengkap berdasarkan varVal
 * @param {Number} varVal - Kode variabel (2790, 2791, 2792, 621)
 * @returns {Object} Dokumen Demografi
 */
export const getAllDemografiByVar = async (varVal = 2790) => {
  const doc = await APIDataBPS.findOne({
    "var.val": Number(varVal),
  }).lean();

  if (!doc) {
    throw new Error(`data Demografi (${varVal}) tidak ditemukan`);
  }

  return { doc };
};

/**
 * Pure function: Dapatkan seluruh dokumen Demografi (2790, 2791, 2792, 621)
 * @returns {Object} List dokumen Demografi
 */
export const getAllDemografi = async () => {
  const docs = await APIDataBPS.find({
    "var.val": { $in: [2790, 2791, 2792, 621] },
  }).lean();

  if (!docs || docs.length === 0) {
    throw new Error("data Demografi tidak ditemukan");
  }

  return { docs };
};

// ================= PER VARIABEL SPECIFIC FUNCTIONS =================

// 1. var 2790: Jumlah Penduduk Total menurut Kelompok Umur
export const getPendudukTotalByKota = (kota) => getDemografiByKota(kota, 2790);
export const getAllPendudukTotal = () => getAllDemografiByVar(2790);

// 2. var 2791: Jumlah Penduduk Laki-Laki menurut Kelompok Umur
export const getPendudukLakiLakiByKota = (kota) =>
  getDemografiByKota(kota, 2791);
export const getAllPendudukLakiLaki = () => getAllDemografiByVar(2791);

// 3. var 2792: Jumlah Penduduk Perempuan menurut Kelompok Umur
export const getPendudukPerempuanByKota = (kota) =>
  getDemografiByKota(kota, 2792);
export const getAllPendudukPerempuan = () => getAllDemografiByVar(2792);

// 4. var 621: Persentase Penduduk Miskin
export const getPendudukMiskinByKota = (kota) => getDemografiByKota(kota, 621);
export const getAllPendudukMiskin = () => getAllDemografiByVar(621);
