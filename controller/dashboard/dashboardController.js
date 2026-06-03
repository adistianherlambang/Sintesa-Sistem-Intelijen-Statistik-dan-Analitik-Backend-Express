import APIDataBPS from "../../db/models/APIDataBPS.js";

/**
 * POST /dashboard/testapi
 * Test API call ke BPS API
 */
export const testBPSAPI = async (req, res) => {
  try {
    const response = await fetch(
      "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/1/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/",
    );
    if (!response.ok) {
      return res.status(response.status).json({
        message: "gagal",
      });
    }
    const data = await response.json();

    return res.json(data);
  } catch (err) {
    res.status(500).json({
      message: "server error",
    });
  }
};

/**
 * GET /dashboard/
 * Dapatkan semua dokumen API Data BPS
 */
export const getAllDashboard = async (req, res) => {
  try {
    const doc = await APIDataBPS.find();
    res.json({ doc });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};
