import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
  findRegionByDataset,
} from "./helpers.js";

/**
 * Pure function: Dapatkan data IHK untuk kota tertentu
 * @param {String} kota - Nama kota
 * @returns {Object} Response data
 * @throws Error jika kota tidak ditemukan atau data tidak tersedia
 */
export const getIhkByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const doc = await APIDataBPS.findOne({
    "var.val": 2245,
  })
    .select("var vervar datacontent yoy")
    .lean();

  if (!doc) {
    throw new Error("data IHK tidak ditemukan");
  }

  const inflasiVar = doc.var.find((item) => item.val === 2245);
  const region = findRegionByDataset(doc.vervar, kota, "ihk_komoditas");

  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const regionVal = region.val.toString();
  const result = buildFilteredKeyValue(doc.datacontent, regionVal, 2);
  const resultYoy = buildFilteredKeyValue(doc.yoy || {}, regionVal, 2);
  const sortedYoy = [...resultYoy].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  return buildResponseWithDashboard(
    region.label,
    inflasiVar,
    regionVal,
    result,
    sortedYoy,
  );
};

/**
 * Pure function: Dapatkan dokumen IHK lengkap
 * @returns {Object} Dokumen IHK
 * @throws Error jika data tidak tersedia
 */
export const getAllIhk = async () => {
  const doc = await APIDataBPS.findOne({
    "var.val": 2245,
  }).lean();

  if (!doc) {
    throw new Error("data IHK tidak ditemukan");
  }

  return { doc };
};
