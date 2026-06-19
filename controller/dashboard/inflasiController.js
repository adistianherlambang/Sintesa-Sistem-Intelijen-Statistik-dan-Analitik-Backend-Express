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

  const parseInflasiKey = (key, regVal) => {
    const yearCode = parseInt(key.slice(regVal.length + 2, regVal.length + 5), 10);
    const monthCode = parseInt(key.slice(regVal.length + 5), 10);
    const year = 1900 + yearCode;
    return { year, month: monthCode };
  };

  const getShortMonthYearLabel = (key) => {
    const { year, month } = parseInflasiKey(key, regionVal);
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
      "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ];
    const shortMonth = monthNames[month - 1] || "";
    const shortYear = String(year).slice(-2);
    return `${shortMonth} ${shortYear}`;
  };

  // Gabungkan MoM tahun berjalan (2026) dan tahun kemarin (2025)
  const combined = [...result, ...resultYoy];
  const sortedCombined = combined.sort((a, b) => {
    const parsedA = parseInflasiKey(a.key, regionVal);
    const parsedB = parseInflasiKey(b.key, regionVal);
    if (parsedA.year !== parsedB.year) {
      return parsedA.year - parsedB.year;
    }
    return parsedA.month - parsedB.month;
  });

  const sorted = [...result].sort((a, b) => {
    const parsedA = parseInflasiKey(a.key, regionVal);
    const parsedB = parseInflasiKey(b.key, regionVal);
    if (parsedA.year !== parsedB.year) {
      return parsedA.year - parsedB.year;
    }
    return parsedA.month - parsedB.month;
  });

  // 1. Hitung Year-to-Date (Y-to-D) secara dinamis dari MoM tahun berjalan & kemarin
  const dataByYear = {};
  sortedCombined.forEach((item) => {
    const { year, month } = parseInflasiKey(item.key, regionVal);
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
  
  const sortedYtd = ytdResult.sort((a, b) => {
    const parsedA = parseInflasiKey(a.key, regionVal);
    const parsedB = parseInflasiKey(b.key, regionVal);
    if (parsedA.year !== parsedB.year) {
      return parsedA.year - parsedB.year;
    }
    return parsedA.month - parsedB.month;
  });

  // Load data IHK untuk menghitung YoY secara dinamis
  const docIhk = await APIDataBPS.findOne({ "var.val": 2245 }).select("vervar datacontent yoy").lean();

  const getDynamicYoyValue = (key, regVal) => {
    if (!docIhk) return 0;
    const { year, month } = parseInflasiKey(key, regVal);
    const regionIhk = findRegionByDataset(docIhk.vervar, kota, "ihk_komoditas");
    if (!regionIhk) return 0;

    const regValIhk = regionIhk.val.toString();
    const yearCodeNow = year % 100;
    const yearCodePrev = yearCodeNow - 1;

    const keyIhkNow = `${regValIhk}224501${yearCodeNow}${month}`;
    const keyIhkPrev = `${regValIhk}224501${yearCodePrev}${month}`;

    const getIhkValue = (k, yr) => {
      if (yr === 26) {
        return parseFloat(docIhk.datacontent[k]);
      } else {
        return docIhk.yoy ? parseFloat(docIhk.yoy[k]) : null;
      }
    };

    const ihkNow = getIhkValue(keyIhkNow, yearCodeNow);
    const ihkPrev = getIhkValue(keyIhkPrev, yearCodePrev);

    if (ihkNow && ihkPrev) {
      const yoyVal = ((ihkNow - ihkPrev) / ihkPrev) * 100;
      return Number(yoyVal.toFixed(2));
    }
    return 0;
  };

  // 2. Format 13 Bulan Terakhir dengan Label Singkat
  const m2mLast13 = sortedCombined.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  const ytdLast13 = sortedYtd.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  const yoyResult = sortedCombined.map((item) => {
    const { year } = parseInflasiKey(item.key, regionVal);
    let yoyVal = 0;
    if (year === 2026) {
      yoyVal = getDynamicYoyValue(item.key, regionVal);
    }
    if (!yoyVal) {
      yoyVal = parseFloat(item.value) || 0; // Fallback jika YoY tahun 2025 atau data IHK kosong
    }
    return {
      key: item.key,
      value: yoyVal,
    };
  });

  const yoyLast13 = yoyResult.slice(-13).map((item) => ({
    label: getShortMonthYearLabel(item.key),
    value: item.value,
  }));

  // Ambil nilai terbaru
  const now = sorted.length > 0 ? sorted[sorted.length - 1].value : 0;
  const then = sorted.length > 1 ? sorted[sorted.length - 2].value : 0;
  const compare = now - then;

  const ytdLatest = sortedYtd.length > 0 ? sortedYtd[sortedYtd.length - 1].value : 0;
  const yoyLatest = yoyResult.length > 0 ? yoyResult[yoyResult.length - 1].value : 0;

  return {
    kota: region.label,
    var: inflasiVar,
    regionVal,
    total: result.length,
    data: sorted,
    ytd: sortedYtd,
    yoy: yoyResult,
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
