import APIDataBPS from "../../db/models/APIDataBPS.js";
import {
  buildFilteredKeyValue,
  buildResponseWithDashboard,
  findRegionByDataset,
  getLastTwoValues,
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
    .select("var vervar datacontent yoy yoy2")
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
  const resultYoy2 = buildFilteredKeyValue(doc.yoy2 || {}, regionVal, 2);
  const sortedYoy = [...resultYoy].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );
  const sortedYoy2 = [...resultYoy2].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  return buildResponseWithDashboard(
    region.label,
    inflasiVar,
    regionVal,
    result,
    sortedYoy,
    sortedYoy2,
  );
};

export const getIhkInfografisByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const doc = await APIDataBPS.findOne({
    "var.val": 2245,
  })
    .select("var vervar datacontent yoy yoy2")
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
  const resultYoy2 = buildFilteredKeyValue(doc.yoy2 || {}, regionVal, 2);
  const sortedYoy = [...resultYoy].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );
  const sortedYoy2 = [...resultYoy2].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );

  const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));
  const { now, compare, then } = getLastTwoValues(sorted);

  const parseIhkKey = (key, regVal) => {
    const yearCode = parseInt(key.slice(regVal.length + 6, regVal.length + 8), 10);
    const monthCode = parseInt(key.slice(regVal.length + 8), 10);
    const year = yearCode < 100 ? 2000 + yearCode : 1900 + yearCode;
    return { year, month: monthCode };
  };

  const getShortMonthYearLabel = (key) => {
    const { year, month } = parseIhkKey(key, regionVal);
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
      "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ];
    const shortMonth = monthNames[month - 1] || "";
    const shortYear = String(year).slice(-2);
    return `${shortMonth} ${shortYear}`;
  };

  const combined = [...result, ...resultYoy];
  const sortedCombined = combined.sort((a, b) => {
    const parsedA = parseIhkKey(a.key, regionVal);
    const parsedB = parseIhkKey(b.key, regionVal);
    if (parsedA.year !== parsedB.year) {
      return parsedA.year - parsedB.year;
    }
    return parsedA.month - parsedB.month;
  });

  const ihkLast13 = sortedCombined.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  return {
    kota: region.label,
    var: inflasiVar,
    regionVal,
    total: result.length,
    data: sorted,
    yoy: sortedYoy,
    yoy2: sortedYoy2,
    ihkLast13,
    dashboard: {
      now,
      then,
      compare: Number(compare.toFixed(2)),
    },
  };
};

/**
 * Pure function: Dapatkan dokumen IHK lengkap
 * @returns {Object} Dokumen IHK
 * @throws Error jika data tidak tersedia
 */
export const getAllIhk = async () => {
  const doc = await APIDataBPS.findOne({
    "var.val": 2245,
  }).lean()

  if (!doc) {
    throw new Error("data IHK tidak ditemukan");
  }

  return { doc };
};
