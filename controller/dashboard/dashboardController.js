import APIDataBPS from "../../db/models/APIDataBPS.js";

/**
 * Pure function: Test API call ke BPS API
 * @returns {Object} Response dari BPS API
 * @throws Error jika fetch gagal
 */
export const testBPSAPI = async () => {
  const response = await fetch(
    "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/",
  );

  if (!response.ok) {
    throw new Error(`BPS API error: ${response.status}`);
  }

  return await response.json();
};

/**
 * Pure function: Dapatkan semua dokumen API Data BPS
 * @returns {Object} Dokumen-dokumen BPS
 * @throws Error jika query gagal
 */
export const getAllDashboard = async () => {
  const doc = await APIDataBPS.find();

  if (!doc || doc.length === 0) {
    throw new Error("data dashboard tidak ditemukan");
  }

  return { doc };
};
