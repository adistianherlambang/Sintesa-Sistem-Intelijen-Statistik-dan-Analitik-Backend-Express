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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Format return terstandar:
 * {
 *   "kota": "",
 *   "inflasi": {
 *     "mom": { "data": [], "prevYear": [], "prev2Year": [] },
 *     "yoy": { "data": [], "prevYear": [], "prev2Year": [] },
 *     "ytd": { "data": [], "prevYear": [], "prev2Year": [] }
 *   },
 *   "ihk": {
 *     "data": [], "prevYear": [], "prev2Year": []
 *   },
 *   "komoditasInflasi": {
 *     "mom": { "hierarki": [], "prevYear": [], "prev2Year": [] },
 *     "yoy": { "hierarki": [], "prevYear": [], "prev2Year": [] },
 *     "ytd": { "hierarki": [], "prevYear": [], "prev2Year": [] }
 *   },
 *   "komoditasIHK": {
 *     "hierarki": [], "prevYear": [], "prev2Year": []
 *   },
 *   "bobot": []
 * }
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
  ] = await Promise.all([
    safeFetch(getInflasiByKota, trimmedKota),
    safeFetch(getInflasiYoyByKota, trimmedKota),
    safeFetch(getInflasiYtdByKota, trimmedKota),
    safeFetch(getIhkByKota, trimmedKota),
    safeFetch(getKomoditasByKota, trimmedKota),
    safeFetch(getKomoditasYoyByKota, trimmedKota),
    safeFetch(getKomoditasYtdByKota, trimmedKota),
    safeFetch(getKomoditasIhkByKota, trimmedKota),
  ]);

  const bobotRaw = getBobotData();
  const bobotList = Array.isArray(bobotRaw?.bobot)
    ? bobotRaw.bobot
    : Array.isArray(bobotRaw)
      ? bobotRaw
      : [];

  return {
    kota: trimmedKota,
    inflasi: {
      mom: {
        data: inflasiMom?.data || [],
        prevYear: inflasiMom?.prevYear || [],
        prev2Year: inflasiMom?.prev2Year || [],
      },
      yoy: {
        data: inflasiYoy?.data || [],
        prevYear: inflasiYoy?.prevYear || [],
        prev2Year: inflasiYoy?.prev2Year || [],
      },
      ytd: {
        data: inflasiYtd?.data || [],
        prevYear: inflasiYtd?.prevYear || [],
        prev2Year: inflasiYtd?.prev2Year || [],
      },
    },
    ihk: {
      data: ihk?.data || [],
      prevYear: ihk?.prevYear || [],
      prev2Year: ihk?.prev2Year || [],
    },
    komoditasInflasi: {
      mom: {
        hierarki: komoditasMom?.hierarki || [],
        prevYear: komoditasMom?.prevYear || komoditasMom?.prevYearList || [],
        prev2Year: komoditasMom?.prev2Year || komoditasMom?.prev2YearList || [],
      },
      yoy: {
        hierarki: komoditasYoy?.hierarki || [],
        prevYear: komoditasYoy?.prevYear || komoditasYoy?.prevYearList || [],
        prev2Year: komoditasYoy?.prev2Year || komoditasYoy?.prev2YearList || [],
      },
      ytd: {
        hierarki: komoditasYtd?.hierarki || [],
        prevYear: komoditasYtd?.prevYear || komoditasYtd?.prevYearList || [],
        prev2Year: komoditasYtd?.prev2Year || komoditasYtd?.prev2YearList || [],
      },
    },
    komoditasIHK: {
      hierarki: komoditasIhk?.hierarki || [],
      prevYear: komoditasIhk?.prevYear || komoditasIhk?.prevYearList || [],
      prev2Year: komoditasIhk?.prev2Year || komoditasIhk?.prev2YearList || [],
    },
    bobot: bobotList,
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
