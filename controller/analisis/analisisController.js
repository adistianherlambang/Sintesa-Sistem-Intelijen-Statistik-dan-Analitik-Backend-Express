import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getInflasiByKota,
  getInflasiYoyByKota,
  getInflasiYtdByKota,
} from "../dashboard/inflasiController.js";
import { getIhkByKota } from "../dashboard/ihkController.js";
import {
  getKomoditasByKota,
  getKomoditasYoyByKota,
  getKomoditasYtdByKota,
  getKomoditasIhkByKota,
} from "../dashboard/komoditasController.js";
import ForecastResult from "../../db/models/ForecastResult.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper: Ambil hasil peramalan untuk kota tertentu
 */
const getForecastByKota = async (cityName) => {
  if (!cityName) return null;
  try {
    const trimmedKota = cityName.trim();
    let doc = await ForecastResult.findOne({ kota: trimmedKota });
    if (!doc) {
      doc = await ForecastResult.findOne({
        kota: {
          $regex: new RegExp(
            `^${trimmedKota.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
      });
    }
    if (!doc) {
      const cleanKota = trimmedKota
        .replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, "")
        .trim();
      doc = await ForecastResult.findOne({
        kota: {
          $regex: new RegExp(
            cleanKota.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
        },
      });
    }
    return doc;
  } catch (err) {
    console.warn(`[getForecastByKota] Warning for ${cityName}:`, err.message);
    return null;
  }
};

/**
 * Helper: Ambil data bobot komoditas dari bobot.json
 */
const getBobotData = () => {
  try {
    const bobotPath = path.resolve(__dirname, "../../json/bobot.json");
    if (fs.existsSync(bobotPath)) {
      return JSON.parse(fs.readFileSync(bobotPath, "utf8"));
    }
  } catch (err) {
    console.warn("[getBobotData] Warning reading bobot.json:", err.message);
  }
  return null;
};

/**
 * Helper: Menjalankan sub-fetch secara aman agar kegagalan 1 metrik tidak menggagalkan seluruh dataset
 */
const safeFetch = async (fetchFn, ...args) => {
  try {
    return await fetchFn(...args);
  } catch (err) {
    console.warn(`[safeFetch] Warning in ${fetchFn.name}:`, err.message);
    return null;
  }
};

/**
 * Controller utama: Dapatkan seluruh data inflasi & IHK (umum & komoditas) untuk kota tertentu
 * @param {String} kota - Nama kota
 * @returns {Object} Data agregat gabungan
 */
export const getInflasiIhkByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const trimmedKota = kota.trim();

  const [
    inflasiMom,
    inflasiYoy,
    inflasiYtd,
    ihk,
    komoditasMom,
    komoditasYoy,
    komoditasYtd,
    komoditasIhk,
    forecast,
  ] = await Promise.all([
    safeFetch(getInflasiByKota, trimmedKota),
    safeFetch(getInflasiYoyByKota, trimmedKota),
    safeFetch(getInflasiYtdByKota, trimmedKota),
    safeFetch(getIhkByKota, trimmedKota),
    safeFetch(getKomoditasByKota, trimmedKota),
    safeFetch(getKomoditasYoyByKota, trimmedKota),
    safeFetch(getKomoditasYtdByKota, trimmedKota),
    safeFetch(getKomoditasIhkByKota, trimmedKota),
    getForecastByKota(trimmedKota),
  ]);

  const bobot = getBobotData();

  return {
    kota: trimmedKota,
    inflasi: {
      mom: inflasiMom,
      yoy: inflasiYoy,
      ytd: inflasiYtd,
    },
    ihk,
    komoditas: {
      mom: komoditasMom,
      yoy: komoditasYoy,
      ytd: komoditasYtd,
    },
    komoditasIhk,
    forecast,
    bobot,
    // Flat aliases untuk fleksibilitas konsumsi
    inflasiMom,
    inflasiYoy,
    inflasiYtd,
    komoditasMom,
    komoditasYoy,
    komoditasYtd,
  };
};

/**
 * Express Request Handler untuk endpoint api/analisis/inflasi-ihk (mendukung POST & GET)
 */
export const handleGetInflasiIhk = async (req, res) => {
  try {
    const kota =
      req.body?.kota ||
      req.query?.kota ||
      req.user?.location?.name;

    if (!kota) {
      return res.status(400).json({ message: "Parameter kota wajib diisi" });
    }

    const data = await getInflasiIhkByKota(kota);
    return res.json(data);
  } catch (err) {
    console.error("[handleGetInflasiIhk] Error:", err.message);
    const status = err.message.includes("wajib diisi") ? 400 : 500;
    return res.status(status).json({ message: err.message });
  }
};
