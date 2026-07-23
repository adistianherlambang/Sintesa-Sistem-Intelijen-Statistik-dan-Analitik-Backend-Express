import APIDataBPS from "../../db/models/APIDataBPS.js";
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };
import { sort, getDateInfo, findRegionByDataset, findUnifiedCity } from "./helpers.js";

/**
 * Helper: Process komoditas data untuk satu item
 */
/**
 * Helper: Process komoditas data untuk satu item
 */
const processKomoditasItem = async (komoditasItem, kota, month, year, prevMom) => {
  const doc = await APIDataBPS.findOne({
    "var.val": komoditasItem.var,
    "turvar.val": komoditasItem.turvar,
  })
    .select("var vervar datacontent prevMom")
    .lean();

  if (!doc || !doc.vervar) {
    return null;
  }

  const region = doc.vervar.find((item) => item.label === kota);
  if (!region) {
    return null;
  }

  const regionVal = region.val.toString();
  const result = [];
  const sub = {};
  const data = {};
  const subData = {};

  // Process current year data
  for (const key in doc.datacontent) {
    const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
    const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
    const keyMonth = key.slice(regionVal.length + 11);

    if (
      key.startsWith(regionVal) &&
      key.slice(regionVal.length, regionVal.length + 1) === "2" &&
      Number(keyMonth) === Number(month) &&
      Number(keyYear) === Number(year)
    ) {
      result.push({
        key,
        value: doc.datacontent[key],
        bulan: keyMonth,
      });
    }

    for (const kelompok of varKelompokIHK) {
      if (
        key.startsWith(regionVal) &&
        turvar === String(kelompok.turvar) &&
        Number(keyYear) === Number(year)
      ) {
        data[key] = doc.datacontent[key];
      }

      for (const item of kelompok.sub) {
        if (
          key.startsWith(regionVal) &&
          turvar === String(item.val) &&
          Number(keyYear) === Number(year)
        ) {
          if (!subData[item.val]) subData[item.val] = {};
          subData[item.val][key] = doc.datacontent[key];
        }

        if (
          key.startsWith(regionVal) &&
          turvar === String(item.val) &&
          Number(keyYear) === Number(year) &&
          Number(keyMonth) === Number(month)
        ) {
          sub[item.val] = {
            label: item.label,
            value: doc.datacontent[key],
            bulan: Number(keyMonth),
            data: sort(subData)[item.val],
          };
        }
      }
    }
  }

  const sortedResult = sort(result);
  const mainData =
    sortedResult && sortedResult.length > 0 ? sortedResult[0] : null;

  const hierarki = {
    label: komoditasItem.nama,
    value: mainData ? mainData.value : 0,
    bulan: mainData ? Number(mainData.bulan) : Number(month),
    data: sort(data),
    sub,
  };

  // Process PrevMoM data
  let prevMomItem = null;
  const prevMomDataSection = doc.prevMom || doc.prevMoM;
  if (prevMomDataSection) {
    const resultPrevMom = [];
    const subPrevMom = {};
    const dataPrevMom = {};
    const subDataPrevMom = {};

    for (const key in prevMomDataSection) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
      const keyMonth = key.slice(regionVal.length + 11);

      if (
        key.startsWith(regionVal) &&
        key.slice(regionVal.length, regionVal.length + 1) === "2" &&
        Number(keyMonth) === Number(month) &&
        Number(keyYear) === Number(prevMom)
      ) {
        resultPrevMom.push({
          key,
          value: prevMomDataSection[key],
          bulan: keyMonth,
        });
      }

      for (const kelompok of varKelompokIHK) {
        if (
          key.startsWith(regionVal) &&
          turvar === String(kelompok.turvar) &&
          Number(keyYear) === Number(prevMom)
        ) {
          dataPrevMom[key] = prevMomDataSection[key];
        }

        for (const item of kelompok.sub) {
          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(prevMom)
          ) {
            if (!subDataPrevMom[item.val]) subDataPrevMom[item.val] = {};
            subDataPrevMom[item.val][key] = prevMomDataSection[key];
          }

          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(prevMom) &&
            Number(keyMonth) === Number(month)
          ) {
            subPrevMom[item.val] = {
              label: item.label,
              value: prevMomDataSection[key],
              bulan: Number(keyMonth),
              data: sort(subDataPrevMom)[item.val],
            };
          }
        }
      }
    }

    const sortedResultPrevMom = sort(resultPrevMom);
    const mainDataPrevMom =
      sortedResultPrevMom && sortedResultPrevMom.length > 0 ? sortedResultPrevMom[0] : null;

    prevMomItem = {
      label: komoditasItem.nama,
      value: mainDataPrevMom ? mainDataPrevMom.value : 0,
      bulan: mainDataPrevMom ? Number(mainDataPrevMom.bulan) : Number(month),
      data: sort(dataPrevMom),
      sub: subPrevMom,
    };
  }

  return { hierarki, prevMomItem };
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
        (item) => Number(item.kotaId) === Number(city.BIKota.id)
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
 * @returns {Object} Data komoditas dengan hierarki dan PrevMoM
 * @throws Error jika kota tidak diisi
 */
export const getKomoditasByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  // Get a sample document to resolve/validate the region name
  const sampleDoc = await APIDataBPS.findOne({
    "var.val": varKelompokIHK[0].var,
    "turvar.val": varKelompokIHK[0].turvar,
  })
    .select("vervar")
    .lean();

  if (!sampleDoc) {
    throw new Error("data komoditas tidak ditemukan");
  }

  const region = findRegionByDataset(sampleDoc.vervar, kota, "ihk_komoditas");
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const resolvedKota = region.label;

  const { month, year, prevMom } = getDateInfo();
  let hierarki = [];
  let prevMomList = [];
  let biggest = null;

  // Process setiap komoditas
  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      prevMom,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.prevMomItem) {
        prevMomList.push(result.prevMomItem);
      }
    }
  }

  // Format sub-komoditas untuk hierarki
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

  // Format sub-komoditas untuk PrevMoM
  for (const key in prevMomList) {
    const subsObjPrevMom = prevMomList[key].sub || {};
    prevMomList[key].sub = Object.entries(subsObjPrevMom)
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

  // Cari komoditas dengan nilai terbesar
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
      "Perlengkapan, Peralatan dan Pemeliharaan Rutin Rumah Tangga": "Peralatan RT",
      "Kesehatan": "Kesehatan",
      "Informasi, Komunikasi dan Jasa Keuangan": "Komunikasi",
      "Transportasi": "Transportasi",
      "Rekreasi, Olahraga dan Budaya": "Rekreasi",
      "Pendidikan": "Pendidikan",
      "Penyediaan Makanan dan Minuman / Restoran": "Restoran",
      "Perawatan Pribadi dan Jasa Lainnya": "Perawatan",
    };
    return mapping[label] || label;
  };

  const top5Mom = [...hierarki]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const top5PrevMom = [...prevMomList]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const hargaBI = await getHargaBIForKota(kota);
  const makananItem = hierarki.find(
    (item) => item.label && item.label.includes("Makanan")
  );
  if (makananItem) {
    makananItem.hargaBI = hargaBI;
  }

  return {
    totalKomoditas: hierarki.length,
    hierarki,
    prevMom: prevMomList,
    biggest,
  };
};

export const getKomoditasInfografisByKota = async (kota) => {
  if (!kota) {
    throw new Error("kota wajib diisi");
  }

  const sampleDoc = await APIDataBPS.findOne({
    "var.val": varKelompokIHK[0].var,
    "turvar.val": varKelompokIHK[0].turvar,
  })
    .select("vervar")
    .lean();

  if (!sampleDoc) {
    throw new Error("data komoditas tidak ditemukan");
  }

  const region = findRegionByDataset(sampleDoc.vervar, kota, "ihk_komoditas");
  if (!region) {
    throw new Error("kota tidak ditemukan");
  }

  const resolvedKota = region.label;

  const { month, year, prevMom } = getDateInfo();
  let hierarki = [];
  let prevMomList = [];
  let biggest = null;

  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      prevMom,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.prevMomItem) {
        prevMomList.push(result.prevMomItem);
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

  for (const key in prevMomList) {
    const subsObjPrevMom = prevMomList[key].sub || {};
    prevMomList[key].sub = Object.entries(subsObjPrevMom)
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
      "Perlengkapan, Peralatan dan Pemeliharaan Rutin Rumah Tangga": "Peralatan RT",
      "Kesehatan": "Kesehatan",
      "Informasi, Komunikasi dan Jasa Keuangan": "Komunikasi",
      "Transportasi": "Transportasi",
      "Rekreasi, Olahraga dan Budaya": "Rekreasi",
      "Pendidikan": "Pendidikan",
      "Penyediaan Makanan dan Minuman / Restoran": "Restoran",
      "Perawatan Pribadi dan Jasa Lainnya": "Perawatan",
    };
    return mapping[label] || label;
  };

  const top5Mom = [...hierarki]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const top5PrevMom = [...prevMomList]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item) => ({ label: getShortLabel(item.label), value: item.value }));

  const hargaBI = await getHargaBIForKota(kota);
  const makananInfografisItem = hierarki.find(
    (item) => item.label && item.label.includes("Makanan")
  );
  if (makananInfografisItem) {
    makananInfografisItem.hargaBI = hargaBI;
  }

  return {
    totalKomoditas: hierarki.length,
    hierarki,
    prevMom: prevMomList,
    biggest,
    top5Mom,
    top5PrevMom,
  };
};

/**
 * Pure function: Dapatkan dokumen komoditas lengkap
 * @returns {Object} Dokumen komoditas
 * @throws Error jika data tidak ditemukan
 */
export const getAllKomoditas = async () => {
  const doc = await APIDataBPS.findOne({
    "var.val": 2224,
  });

  if (!doc) {
    throw new Error("data komoditas tidak ditemukan");
  }

  return doc;
};
