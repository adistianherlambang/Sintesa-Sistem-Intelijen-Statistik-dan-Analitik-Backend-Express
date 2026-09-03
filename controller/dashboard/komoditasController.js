import APIDataBPS from "../../db/models/APIDataBPS.js";
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };
import {
  sort,
  getDateInfo,
  findRegionByDataset,
  findUnifiedCity,
} from "./helpers.js";

/**
 * Helper: Process komoditas data untuk satu item
 */
const processKomoditasItem = async (
  komoditasItem,
  kota,
  month,
  year,
  prevYear,
  prev2Year,
  varKeyField = "var",
  fallbackRegionVal = null,
) => {
  const targetVar = komoditasItem[varKeyField] || komoditasItem.var;
  const doc = await APIDataBPS.findOne({
    "var.val": targetVar,
  })
    .select("var vervar datacontent prevYear prev2Year")
    .lean();

  if (!doc) {
    return null;
  }

  let regionVal = fallbackRegionVal;
  if (Array.isArray(doc.vervar) && doc.vervar.length > 0) {
    const region = doc.vervar.find((item) => item.label === kota);
    if (region) {
      regionVal = region.val.toString();
    }
  }

  if (!regionVal) {
    return null;
  }

  const data = {};
  const subData = {};

  // Process current year data
  if (doc.datacontent) {
    for (const key in doc.datacontent) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);

      if (key.startsWith(regionVal) && Number(keyYear) === Number(year)) {
        if (turvar === String(komoditasItem.turvar)) {
          data[key] = doc.datacontent[key];
        }

        for (const item of komoditasItem.sub || []) {
          if (turvar === String(item.val)) {
            if (!subData[item.val]) subData[item.val] = {};
            subData[item.val][key] = doc.datacontent[key];
          }
        }
      }
    }
  }

  const sortedData = sort(data);
  const dataEntries = Object.entries(sortedData);
  const mainData =
    dataEntries.length > 0 ? dataEntries[dataEntries.length - 1] : null;

  const mainValue = mainData ? mainData[1] : 0;
  const mainBulan = mainData
    ? Number(mainData[0].slice(regionVal.length + 11))
    : Number(month);

  const sub = {};
  for (const item of komoditasItem.sub || []) {
    const sortedSubData = sort(subData[item.val] || {});
    const subEntries = Object.entries(sortedSubData);
    const mainSubData =
      subEntries.length > 0 ? subEntries[subEntries.length - 1] : null;

    sub[item.val] = {
      label: item.label,
      value: mainSubData ? mainSubData[1] : 0,
      bulan: mainSubData
        ? Number(mainSubData[0].slice(regionVal.length + 11))
        : Number(month),
      data: sortedSubData,
    };
  }

  const hierarki = {
    label: komoditasItem.nama,
    value: mainValue,
    bulan: mainBulan,
    data: sortedData,
    sub,
  };

  // Process prevYear data
  let prevYearItem = null;
  if (doc.prevYear) {
    const dataPrevYear = {};
    const subDataPrevYear = {};

    for (const key in doc.prevYear) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);

      if (
        key.startsWith(regionVal) &&
        Number(keyYear) === Number(prevYear)
      ) {
        if (turvar === String(komoditasItem.turvar)) {
          dataPrevYear[key] = doc.prevYear[key];
        }

        for (const item of komoditasItem.sub || []) {
          if (turvar === String(item.val)) {
            if (!subDataPrevYear[item.val]) subDataPrevYear[item.val] = {};
            subDataPrevYear[item.val][key] = doc.prevYear[key];
          }
        }
      }
    }

    const sortedDataPrevYear = sort(dataPrevYear);
    const dataEntriesPrevYear = Object.entries(sortedDataPrevYear);
    const mainDataPrevYear =
      dataEntriesPrevYear.length > 0
        ? dataEntriesPrevYear[dataEntriesPrevYear.length - 1]
        : null;

    const prevYearValue = mainDataPrevYear ? mainDataPrevYear[1] : 0;
    const prevYearBulan = mainDataPrevYear
      ? Number(mainDataPrevYear[0].slice(regionVal.length + 11))
      : Number(month);

    const subPrevYear = {};
    for (const item of komoditasItem.sub || []) {
      const sortedSubDataPrev = sort(subDataPrevYear[item.val] || {});
      const subEntriesPrev = Object.entries(sortedSubDataPrev);
      const mainSubDataPrev =
        subEntriesPrev.length > 0
          ? subEntriesPrev[subEntriesPrev.length - 1]
          : null;

      subPrevYear[item.val] = {
        label: item.label,
        value: mainSubDataPrev ? mainSubDataPrev[1] : 0,
        bulan: mainSubDataPrev
          ? Number(mainSubDataPrev[0].slice(regionVal.length + 11))
          : Number(month),
        data: sortedSubDataPrev,
      };
    }

    prevYearItem = {
      label: komoditasItem.nama,
      value: prevYearValue,
      bulan: prevYearBulan,
      data: sortedDataPrevYear,
      sub: subPrevYear,
    };
  }

  // Process prev2Year data
  let prev2YearItem = null;
  if (doc.prev2Year) {
    const dataPrev2Year = {};
    const subDataPrev2Year = {};

    for (const key in doc.prev2Year) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);

      if (
        key.startsWith(regionVal) &&
        Number(keyYear) === Number(prev2Year)
      ) {
        if (turvar === String(komoditasItem.turvar)) {
          dataPrev2Year[key] = doc.prev2Year[key];
        }

        for (const item of komoditasItem.sub || []) {
          if (turvar === String(item.val)) {
            if (!subDataPrev2Year[item.val]) subDataPrev2Year[item.val] = {};
            subDataPrev2Year[item.val][key] = doc.prev2Year[key];
          }
        }
      }
    }

    const sortedDataPrev2Year = sort(dataPrev2Year);
    const dataEntriesPrev2Year = Object.entries(sortedDataPrev2Year);
    const mainDataPrev2Year =
      dataEntriesPrev2Year.length > 0
        ? dataEntriesPrev2Year[dataEntriesPrev2Year.length - 1]
        : null;

    const prev2YearValue = mainDataPrev2Year ? mainDataPrev2Year[1] : 0;
    const prev2YearBulan = mainDataPrev2Year
      ? Number(mainDataPrev2Year[0].slice(regionVal.length + 11))
      : Number(month);

    const subPrev2Year = {};
    for (const item of komoditasItem.sub || []) {
      const sortedSubDataPrev2 = sort(subDataPrev2Year[item.val] || {});
      const subEntriesPrev2 = Object.entries(sortedSubDataPrev2);
      const mainSubDataPrev2 =
        subEntriesPrev2.length > 0
          ? subEntriesPrev2[subEntriesPrev2.length - 1]
          : null;

      subPrev2Year[item.val] = {
        label: item.label,
        value: mainSubDataPrev2 ? mainSubDataPrev2[1] : 0,
        bulan: mainSubDataPrev2
          ? Number(mainSubDataPrev2[0].slice(regionVal.length + 11))
          : Number(month),
        data: sortedSubDataPrev2,
      };
    }

    prev2YearItem = {
      label: komoditasItem.nama,
      value: prev2YearValue,
      bulan: prev2YearBulan,
      data: sortedDataPrev2Year,
      sub: subPrev2Year,
    };
  }

  return { hierarki, prevYearItem, prev2YearItem };
};

/**
 * Helper: Ambil data HargaBI berdasarkan ID kota dari kota.json
 */
const parseNumber = (val) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const clean = String(val).replace(/,/g, "");
  const num = Number(clean);
  return isNaN(num) ? 0 : num;
};

const getHargaBIForKota = async (searchName) => {
  let hargaBI = [];
  const city = findUnifiedCity(searchName);
  if (city && city.BIKota && city.BIKota.id !== undefined) {
    const biDoc = await APIDataBPS.findOne({
      "var.val": 2223,
      "turvar.val": 1551,
    })
      .select("HargaBI")
      .lean();

    if (biDoc && Array.isArray(biDoc.HargaBI)) {
      const matchedBI = biDoc.HargaBI.find(
        (item) => Number(item.kotaId) === Number(city.BIKota.id),
      );
      if (matchedBI && matchedBI.data) {
        hargaBI = matchedBI.data.map((item) => ({
          ...item,
          akhir: parseNumber(item.akhir),
          awal: parseNumber(item.awal),
        }));
      }
    }
  }
  return hargaBI;
};

/**
 * Pure function: Dapatkan data komoditas untuk kota tertentu dengan breakdown per sub-komoditas
 * @param {String} kota - Nama kota
 * @param {String} [varKeyField="var"] - Field nama var yang digunakan ("var", "yoy", "ytd")
 * @returns {Object} Data komoditas dengan hierarki, prevYear, dan prev2Year
 * @throws Error jika kota tidak diisi
 */
export const getKomoditasByKota = async (kota, varKeyField = "var") => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const sampleVar = varKelompokIHK[0][varKeyField] || varKelompokIHK[0].var;
  let sampleDoc = await APIDataBPS.findOne({
    "var.val": sampleVar,
  })
    .select("vervar")
    .lean();

  if (
    !sampleDoc ||
    !Array.isArray(sampleDoc.vervar) ||
    sampleDoc.vervar.length === 0
  ) {
    sampleDoc = await APIDataBPS.findOne({
      "var.val": varKelompokIHK[0].var,
    })
      .select("vervar")
      .lean();
  }

  if (
    !sampleDoc ||
    !Array.isArray(sampleDoc.vervar) ||
    sampleDoc.vervar.length === 0
  ) {
    throw new Error("data komoditas tidak ditemukan");
  }

  const region = findRegionByDataset(sampleDoc.vervar, kota, "ihk_komoditas");
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const resolvedKota = region.label;
  const regionVal = region.val.toString();

  const { month, year, prevYear, prev2Year } = getDateInfo();
  let hierarki = [];
  let prevYearList = [];
  let prev2YearList = [];
  let biggest = null;

  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      prevYear,
      prev2Year,
      varKeyField,
      regionVal,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.prevYearItem) {
        prevYearList.push(result.prevYearItem);
      }
      if (result.prev2YearItem) {
        prev2YearList.push(result.prev2YearItem);
      }
    }
  }

  for (const key in hierarki) {
    const subsObj = hierarki[key].sub || {};
    hierarki[key].sub = Object.entries(subsObj)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  for (const key in prevYearList) {
    const subsObjPrev = prevYearList[key].sub || {};
    prevYearList[key].sub = Object.entries(subsObjPrev)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  for (const key in prev2YearList) {
    const subsObjPrev2 = prev2YearList[key].sub || {};
    prev2YearList[key].sub = Object.entries(subsObjPrev2)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  if (hierarki.length > 0) {
    biggest = hierarki.reduce((max, item) => {
      const currentVal = parseFloat(item.value) || 0;
      const maxVal = parseFloat(max.value) || 0;
      return currentVal > maxVal ? item : max;
    }, hierarki[0]);
  }

  const getShortLabel = (label) => {
    const mapping = {
      "Makanan, Minuman dan Tembakau": "Makanan",
      "Pakaian dan Alas Kaki": "Pakaian",
      "Perumahan, Air, Listrik dan Bahan Bakar Rumah Tangga": "Perumahan",
      "Perlengkapan, Peralatan dan Pemeliharaan Rutin Rumah Tangga":
        "Peralatan RT",
      Kesehatan: "Kesehatan",
      "Informasi, Komunikasi dan Jasa Keuangan": "Komunikasi",
      Transportasi: "Transportasi",
      "Rekreasi, Olahraga dan Budaya": "Rekreasi",
      Pendidikan: "Pendidikan",
      "Penyediaan Makanan dan Minuman / Restoran": "Restoran",
      "Perawatan Pribadi dan Jasa Lainnya": "Perawatan",
    };
    return mapping[label] || label;
  };

  const topMom = [...hierarki]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const topYoy = [...prevYearList]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const top5Prev2Year = [...prev2YearList]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const allSubMom = [];
  hierarki.forEach((group) => {
    if (Array.isArray(group.sub)) {
      group.sub.forEach((subItem) => {
        allSubMom.push({
          label: subItem.label,
          value: parseFloat(subItem.value) || 0,
          group: getShortLabel(group.label),
        });
      });
    }
  });
  const topSubMom = allSubMom.sort((a, b) => b.value - a.value).slice(0, 5);

  const allSubYoy = [];
  prevYearList.forEach((group) => {
    if (Array.isArray(group.sub)) {
      group.sub.forEach((subItem) => {
        allSubYoy.push({
          label: subItem.label,
          value: parseFloat(subItem.value) || 0,
          group: getShortLabel(group.label),
        });
      });
    }
  });
  const topSubYoy = allSubYoy.sort((a, b) => b.value - a.value).slice(0, 5);

  const hargaBI = await getHargaBIForKota(resolvedKota);
  const makananInfografisItem = hierarki.find(
    (item) => item.label && item.label.includes("Makanan"),
  );
  if (makananInfografisItem) {
    makananInfografisItem.hargaBI = hargaBI;
  }

  return {
    totalKomoditas: hierarki.length,
    hierarki,
    prevYear: prevYearList,
    prev2Year: prev2YearList,
    prevYearList,
    prev2YearList,
    biggest,
    topmom: topMom,
    topyoy: topYoy,
    topMom,
    topYoy,
    top5Mom: topMom,
    top5Yoy: topYoy,
    top5PrevYear: topYoy,
    top5Prev2Year,
    topSubMom,
    topSubYoy,
    topsubmom: topSubMom,
    topsubyoy: topSubYoy,
  };
};

export const getKomoditasYoyByKota = async (kota) => {
  return getKomoditasByKota(kota, "yoy");
};

export const getKomoditasYtdByKota = async (kota) => {
  return getKomoditasByKota(kota, "ytd");
};

export const getKomoditasIhkByKota = async (kota) => {
  return getKomoditasByKota(kota, "ihk");
};

export const getKomoditasIhkInfografisByKota = async (kota) => {
  return getKomoditasInfografisByKota(kota, "ihk");
};

export const getKomoditasInfografisByKota = async (
  kota,
  varKeyField = "var",
) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const sampleVar = varKelompokIHK[0][varKeyField] || varKelompokIHK[0].var;
  let sampleDoc = await APIDataBPS.findOne({
    "var.val": sampleVar,
  })
    .select("vervar")
    .lean();

  if (
    !sampleDoc ||
    !Array.isArray(sampleDoc.vervar) ||
    sampleDoc.vervar.length === 0
  ) {
    sampleDoc = await APIDataBPS.findOne({
      "var.val": varKelompokIHK[0].var,
    })
      .select("vervar")
      .lean();
  }

  if (
    !sampleDoc ||
    !Array.isArray(sampleDoc.vervar) ||
    sampleDoc.vervar.length === 0
  ) {
    throw new Error("data komoditas tidak ditemukan");
  }

  const region = findRegionByDataset(sampleDoc.vervar, kota, "ihk_komoditas");
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const resolvedKota = region.label;
  const regionVal = region.val.toString();

  const { month, year, prevYear, prev2Year } = getDateInfo();
  let hierarki = [];
  let prevYearList = [];
  let prev2YearList = [];
  let biggest = null;

  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      prevYear,
      prev2Year,
      varKeyField,
      regionVal,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.prevYearItem) {
        prevYearList.push(result.prevYearItem);
      }
      if (result.prev2YearItem) {
        prev2YearList.push(result.prev2YearItem);
      }
    }
  }

  for (const key in hierarki) {
    const subsObj = hierarki[key].sub || {};
    hierarki[key].sub = Object.entries(subsObj)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  for (const key in prevYearList) {
    const subsObjPrev = prevYearList[key].sub || {};
    prevYearList[key].sub = Object.entries(subsObjPrev)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  for (const key in prev2YearList) {
    const subsObjPrev2 = prev2YearList[key].sub || {};
    prev2YearList[key].sub = Object.entries(subsObjPrev2)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => ({
        label: v.label,
        value: v.value,
        bulan: v.bulan,
        data: Object.fromEntries(
          Object.entries(v.data || {}).sort(
            (x, y) => Number(x[0]) - Number(y[0]),
          ),
        ),
      }));
  }

  if (hierarki.length > 0) {
    biggest = hierarki.reduce((max, item) => {
      const currentVal = parseFloat(item.value) || 0;
      const maxVal = parseFloat(max.value) || 0;
      return currentVal > maxVal ? item : max;
    }, hierarki[0]);
  }

  const getShortLabel = (label) => {
    const mapping = {
      "Makanan, Minuman dan Tembakau": "Makanan",
      "Pakaian dan Alas Kaki": "Pakaian",
      "Perumahan, Air, Listrik dan Bahan Bakar Rumah Tangga": "Perumahan",
      "Perlengkapan, Peralatan dan Pemeliharaan Rutin Rumah Tangga":
        "Peralatan RT",
      Kesehatan: "Kesehatan",
      "Informasi, Komunikasi dan Jasa Keuangan": "Komunikasi",
      Transportasi: "Transportasi",
      "Rekreasi, Olahraga dan Budaya": "Rekreasi",
      Pendidikan: "Pendidikan",
      "Penyediaan Makanan dan Minuman / Restoran": "Restoran",
      "Perawatan Pribadi dan Jasa Lainnya": "Perawatan",
    };
    return mapping[label] || label;
  };

  const topMom = [...hierarki]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const topYoy = [...prevYearList]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const top5Prev2Year = [...prev2YearList]
    .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const hargaBI = await getHargaBIForKota(resolvedKota);
  const makananItem = hierarki.find(
    (item) => item.label && item.label.includes("Makanan"),
  );
  if (makananItem) {
    makananItem.hargaBI = hargaBI;
  }

  return {
    totalKomoditas: hierarki.length,
    hierarki,
    prevYear: prevYearList,
    prev2Year: prev2YearList,
    biggest,
    topmom: topMom,
    topyoy: topYoy,
    topMom,
    topYoy,
    top5Mom: topMom,
    top5Yoy: topYoy,
    top5PrevYear: topYoy,
    top5Prev2Year,
  };
};

/**
 * Pure function: Dapatkan dokumen komoditas lengkap
 * @param {String} [varKeyField="var"] - Field nama var yang digunakan ("var", "yoy", "ytd")
 * @returns {Object} Dokumen komoditas
 * @throws Error jika data tidak ditemukan
 */
export const getAllKomoditas = async (varKeyField = "var") => {
  const targetVar = varKelompokIHK[0][varKeyField] || varKelompokIHK[0].var;
  const doc = await APIDataBPS.findOne({
    "var.val": targetVar,
  });

  if (!doc) {
    throw new Error("data komoditas tidak ditemukan");
  }

  return doc;
};

export const getAllKomoditasYoy = async () => {
  return getAllKomoditas("yoy");
};

export const getAllKomoditasYtd = async () => {
  return getAllKomoditas("ytd");
};

export const getAllKomoditasIhk = async () => {
  return getAllKomoditas("ihk");
};
