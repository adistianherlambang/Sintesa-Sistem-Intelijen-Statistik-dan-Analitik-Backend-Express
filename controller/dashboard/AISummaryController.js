import AISummary from "../../db/models/AISummary.js";
import { findUnifiedCity } from "./helpers.js";

/**
 * Pure function: Dapatkan data IHK untuk kota tertentu
 * @param {String} kota - Nama kota
 * @returns {Object} Response data
 * @throws Error jika kota tidak ditemukan atau data tidak tersedia
 */

export const getAISummaryByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const unified = findUnifiedCity(kota);

  if (!unified) {
    throw new Error("Kota tidak ditemukan");
  }

  const doc = await AISummary.findOne({ kota: unified.name }).lean();

  if (!doc) {
    throw new Error("Data tidak ditemukan");
  }

  return doc;
};
