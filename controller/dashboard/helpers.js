import kotaConfig from "../../json/kota.json" with { type: "json" };

/**
 * Helper functions untuk dashboard controllers
 */

/**
 * Sort object atau array berdasarkan nomor key
 * @param {Object|Array} itemSorted - Data yang akan di-sort
 * @returns {Array|Object} Data yang sudah di-sort
 */
export const sort = (itemSorted) => {
  if (Array.isArray(itemSorted)) {
    return [...itemSorted].sort((a, b) => Number(a.key) - Number(b.key));
  }

  return Object.fromEntries(
    Object.entries(itemSorted).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
};

/**
 * Ambil nilai akhir dan selisih dari array yang sudah terurut
 * @param {Array} sorted - Array yang sudah di-sort
 * @returns {Object} {now, compare}
 */
export const getLastTwoValues = (sorted) => {
  const now = sorted.length > 0 ? sorted[sorted.length - 1].value : 0;
  const then = sorted.length > 1 ? sorted[sorted.length - 2].value : 0;
  const compare = now - then;
  return { now, compare };
};

/**
 * Bangun array {key, value} berdasarkan region, prefix, dan filter opsional
 * @param {Object} documentSection - Bagian dokumen dari database
 * @param {String} regionVal - Nilai region
 * @param {Number} prefix - Prefix yang dicari
 * @param {Number|null} yearFilter - Filter tahun (opsional)
 * @param {Number|null} monthFilter - Filter bulan (opsional)
 * @returns {Array} Array hasil filter
 */
export const buildFilteredKeyValue = (
  documentSection,
  regionVal,
  prefix,
  yearFilter = null,
  monthFilter = null,
) => {
  const result = [];

  for (const key in documentSection) {
    const startsWithRegion = key.startsWith(regionVal);
    const hasPrefix =
      key.slice(regionVal.length, regionVal.length + 1) === String(prefix);

    if (!startsWithRegion || !hasPrefix) continue;

    if (yearFilter !== null || monthFilter !== null) {
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
      const keyMonth = key.slice(regionVal.length + 11);

      if (yearFilter !== null && Number(keyYear) !== Number(yearFilter))
        continue;
      if (monthFilter !== null && Number(keyMonth) !== Number(monthFilter))
        continue;
    }

    result.push({
      key,
      value: documentSection[key],
    });
  }

  return result;
};

/**
 * Bangun response JSON untuk inflasi/ihk dengan dashboard
 * @param {String} kota - Nama kota
 * @param {Object} inflasiVar - Variable inflasi
 * @param {String} regionVal - Nilai region
 * @param {Array} result - Hasil data
 * @param {Array} sortedYoy - Data YoY yang sudah di-sort
 * @returns {Object} Response object
 */
export const buildResponseWithDashboard = (
  kota,
  inflasiVar,
  regionVal,
  result,
  sortedYoy,
) => {
  const sorted = [...result].sort((a, b) => Number(a.key) - Number(b.key));
  const { now, compare } = getLastTwoValues(sorted);

  return {
    kota,
    var: inflasiVar,
    regionVal,
    total: result.length,
    data: sorted,
    dashboard: {
      now,
      compare: Number(compare.toFixed(2)),
    },
    yoy: sortedYoy,
  };
};

/**
 * Get current date info untuk filter tahun/bulan
 * @returns {Object} {month, year, yoy}
 */
export const getDateInfo = () => {
  const date = new Date();
  const month = String(date.getMonth() - 1);
  const year = "1" + String(date.getFullYear()).slice(2, 4);
  const yoy = year - 1;
  
  return { month, year, yoy };
};

/**
 * Helper: Find the index of a region based on its label in either list.
 * @param {String} searchName - The input name (e.g. "meulaboh", "MUARA BUNGO")
 * @returns {Number} Index in the arrays, or -1 if not found.
 */
export const findRegionIndex = (searchName) => {
  if (!searchName) return -1;

  const clean = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const searchClean = clean(searchName);

  // 1. Try exact clean match on either list
  for (let i = 0; i < kotaConfig.inflasi.length; i++) {
    if (
      clean(kotaConfig.inflasi[i].label) === searchClean ||
      clean(kotaConfig.ihk_komoditas[i].label) === searchClean
    ) {
      return i;
    }
  }

  // 2. Try prefix-stripped clean match
  const strip = (str) => str.replace(/^(KOTA|KABUPATEN|KAB)/g, "");
  const searchStripped = strip(searchClean);

  for (let i = 0; i < kotaConfig.inflasi.length; i++) {
    const inflasiClean = clean(kotaConfig.inflasi[i].label);
    const ihkClean = clean(kotaConfig.ihk_komoditas[i].label);

    if (
      strip(inflasiClean) === searchStripped ||
      strip(ihkClean) === searchStripped
    ) {
      return i;
    }
  }

  // 3. Fallback for specific names like BUNGO vs MUARA BUNGO
  const searchUpper = searchName.toUpperCase().trim();
  if (searchUpper.includes("BUNGO")) {
    for (let i = 0; i < kotaConfig.inflasi.length; i++) {
      if (
        kotaConfig.inflasi[i].label.includes("BUNGO") ||
        kotaConfig.ihk_komoditas[i].label.includes("BUNGO")
      ) {
        return i;
      }
    }
  }

  return -1;
};

/**
 * Helper: Find region object in the database's vervar list using the structured kota.json mapping.
 * @param {Array} vervar - vervar array from database document
 * @param {String} searchName - User input city name
 * @param {String} datasetType - "inflasi" or "ihk_komoditas"
 * @returns {Object|null} Matching region or null
 */
export const findRegionByDataset = (vervar, searchName, datasetType) => {
  if (!searchName || !vervar) return null;

  const index = findRegionIndex(searchName);
  if (index === -1) return null;

  // Get the target canonical label based on dataset type
  const targetLabel =
    datasetType === "inflasi"
      ? kotaConfig.inflasi[index].label
      : kotaConfig.ihk_komoditas[index].label;

  // Find exact match in vervar list (case-insensitive)
  const targetUpper = targetLabel.toUpperCase().trim();
  return vervar.find((item) => item.label.toUpperCase().trim() === targetUpper) || null;
};
