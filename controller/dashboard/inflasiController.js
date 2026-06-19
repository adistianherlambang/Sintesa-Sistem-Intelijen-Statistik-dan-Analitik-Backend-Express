import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
  findRegionByDataset,
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
  const region = findRegionByDataset(doc.vervar, kota, "inflasi");

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

export const getInflasiInfografisByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const doc = await APIDataBPS.findOne({
    "var.val": 1,
  })
    .select("var vervar datacontent yoy")
    .lean();

  if (!doc) {
    throw new Error("data inflasi tidak ditemukan");
  }

  const inflasiVar = doc.var.find((item) => item.val === 1);
  const region = findRegionByDataset(doc.vervar, kota, "inflasi");

  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const regionVal = region.val.toString();

  const result = buildFilteredKeyValue(doc.datacontent, regionVal, 1);
  const resultYoy = buildFilteredKeyValue(doc.yoy || {}, regionVal, 1);
  const sortedYoy = [...resultYoy].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));

  // 1. Hitung Year-to-Date (Y-to-D) secara dinamis dari MoM tahun berjalan
  const dataByYear = {};
  sorted.forEach((item) => {
    const year = item.key.slice(regionVal.length + 2, regionVal.length + 5);
    const month = parseInt(item.key.slice(regionVal.length + 5), 10);
    if (!dataByYear[year]) {
      dataByYear[year] = [];
    }
    dataByYear[year].push({ ...item, month });
  });

  const ytdResult = [];
  for (const year in dataByYear) {
    const sortedMonths = dataByYear[year].sort((a, b) => a.month - b.month);
    let cumulativeMultiplier = 1;
    sortedMonths.forEach((item) => {
      const val = parseFloat(item.value) || 0;
      cumulativeMultiplier *= (1 + val / 100);
      const ytdValue = (cumulativeMultiplier - 1) * 100;
      ytdResult.push({
        key: item.key,
        value: Number(ytdValue.toFixed(2)),
      });
    });
  }
  const sortedYtd = ytdResult.sort((a, b) => Number(a.key) - Number(b.key));

  // 2. Format 13 Bulan Terakhir dengan Label Singkat (misal "Jun 25")
  const getShortMonthYearLabel = (key) => {
    const yearCode = parseInt(key.slice(regionVal.length + 2, regionVal.length + 5), 10);
    const monthCode = parseInt(key.slice(regionVal.length + 5), 10);
    const year = 1900 + yearCode;
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
      "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ];
    const shortMonth = monthNames[monthCode - 1] || "";
    const shortYear = String(year).slice(-2);
    return `${shortMonth} ${shortYear}`;
  };

  const m2mLast13 = sorted.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  const yoyLast13 = sortedYoy.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  const ytdLast13 = sortedYtd.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  // Ambil nilai terbaru
  const now = sorted.length > 0 ? sorted[sorted.length - 1].value : 0;
  const then = sorted.length > 1 ? sorted[sorted.length - 2].value : 0;
  const compare = now - then;

  const ytdLatest = sortedYtd.length > 0 ? sortedYtd[sortedYtd.length - 1].value : 0;
  const yoyLatest = sortedYoy.length > 0 ? sortedYoy[sortedYoy.length - 1].value : 0;

  return {
    kota: region.label,
    var: inflasiVar,
    regionVal,
    total: result.length,
    data: sorted,
    ytd: sortedYtd,
    yoy: sortedYoy,
    m2mLast13,
    yoyLast13,
    ytdLast13,
    dashboard: {
      now,
      then,
      compare: Number(compare.toFixed(2)),
      ytd: ytdLatest,
      yoy: yoyLatest,
    },
  };
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
