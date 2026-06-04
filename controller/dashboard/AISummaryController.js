import AISummary from "../../db/models/AISummary";
import { findRegionByDataset } from "./helpers";

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

  const doc = await AISummary.findOne({ city: kota }).lean();

  if (!doc) {
    throw new Error("Data tidak ditemukan");
  }

  return doc;
};