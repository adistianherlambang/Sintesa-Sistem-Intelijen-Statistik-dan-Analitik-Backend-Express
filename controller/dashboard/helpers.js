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
 * Helper: Find region by name with fallbacks (Kota, Kabupaten, Kab)
 * @param {Array} vervar - List of regions
 * @param {String} kota - City name
 * @returns {Object|null} Matching region or null
 */
export const findRegion = (vervar, kota) => {
  if (!kota || !vervar) return null;
  
  // Standardize search term (uppercase and trimmed)
  const searchUpper = kota.toUpperCase().trim();

  // Helper to extract base name by removing prefix if present
  const stripPrefix = (str) => {
    if (str.startsWith("KOTA ")) {
      return str.slice(5).trim();
    }
    if (str.startsWith("KABUPATEN ")) {
      return str.slice(10).trim();
    }
    if (str.startsWith("KAB ")) {
      return str.slice(4).trim();
    }
    return str;
  };

  const strippedSearch = stripPrefix(searchUpper);

  // Generate candidate search terms in order of preference:
  const candidates = [
    searchUpper,                       // 1. Direct match (e.g. "KOTA MEULABOH" or "MEULABOH")
    strippedSearch,                    // 2. Stripped prefix (e.g. "MEULABOH" if input was "KOTA MEULABOH")
    "KOTA " + strippedSearch,          // 3. Prepend "KOTA " to base name
    "KABUPATEN " + strippedSearch,     // 4. Prepend "KABUPATEN " to base name
    "KAB " + strippedSearch            // 5. Prepend "KAB " to base name
  ];

  // Try each candidate in order of preference
  for (const candidate of candidates) {
    const found = vervar.find((item) => item.label.toUpperCase().trim() === candidate);
    if (found) {
      return found;
    }
  }

  return null;
};
