import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
  findRegion,
} from "./helpers.js";

/**
 * Pure function: Dapatkan data inflasi untuk kota tertentu
 * @param {String} kota - Nama kota
 * @returns {Object} Response data
 * @throws Error jika kota tidak ditemukan atau data tidak tersedia
 */
export const getInflasiByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  // Ambil dokumen inflasi dengan var.val = 1
  const doc = await APIDataBPS.findOne({
    "var.val": 1,
  })
    .select("var vervar datacontent yoy")
    .lean();

  if (!doc) {
    throw new Error("data inflasi tidak ditemukan");
  }

  const inflasiVar = doc.var.find((item) => item.val === 1);
  const region = findRegion(doc.vervar, kota);

  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const regionVal = region.val.toString();

  const result = buildFilteredKeyValue(doc.datacontent, regionVal, 1);
  const resultYoy = buildFilteredKeyValue(doc.yoy || {}, regionVal, 1);
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
 * Pure function: Dapatkan dokumen inflasi lengkap
 * @returns {Object} Dokumen inflasi
 * @throws Error jika data tidak tersedia
 */
export const getAllInflasi = async () => {
  const doc = await APIDataBPS.findOne({
    "var.val": 1,
  });

  if (!doc) {
    throw new Error("data inflasi tidak ditemukan");
  }

  return { doc };
};
