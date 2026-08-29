import APIDataBPS from "../../db/models/APIDataBPS.js";

/**
 * Pure function: Test API call ke BPS API
 * @returns {Object} Response dari BPS API
 * @throws Error jika fetch gagal
 */
export const testBPSAPI = async () => {
  const bpsKey = process.env.API_BPS ? process.env.API_BPS.trim() : "";
  const response = await fetch(
    `https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/th/126/key/${bpsKey}/`,
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

/**
 * Pure function: Dapatkan daftar variabel (var.val & var.label) dari MongoDB
 * @returns {Array} List dokumen dengan { var: [{ val, label }] }
 */
export const getAllApiVariables = async () => {
  const list = await APIDataBPS.find(
    {},
    { _id: 0, "var.val": 1, "var.label": 1 },
  ).lean();

  return list;
};
