import APIDataBPS from "../../db/models/APIDataBPS.js";
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };
import { sort, getDateInfo, findRegionByDataset, findUnifiedCity } from "./helpers.js";

/**
 * Helper: Process komoditas data untuk satu item
 */
const processKomoditasItem = async (komoditasItem, kota, month, year, yoy, yoy2) => {
  const doc = await APIDataBPS.findOne({
    "var.val": komoditasItem.var,
    "turvar.val": komoditasItem.turvar,
  })
    .select("var vervar datacontent yoy yoy2")
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

  // Process YoY data
  let yoyItem = null;
  if (doc.yoy) {
    const resultYoy = [];
    const subYoy = {};
    const dataYoy = {};
    const subDataYoy = {};

    for (const key in doc.yoy) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
      const keyMonth = key.slice(regionVal.length + 11);

      if (
        key.startsWith(regionVal) &&
        key.slice(regionVal.length, regionVal.length + 1) === "2" &&
        Number(keyMonth) === Number(month) &&
        Number(keyYear) === Number(yoy)
      ) {
        resultYoy.push({
          key,
          value: doc.yoy[key],
          bulan: keyMonth,
        });
      }

      for (const kelompok of varKelompokIHK) {
        if (
          key.startsWith(regionVal) &&
          turvar === String(kelompok.turvar) &&
          Number(keyYear) === Number(yoy)
        ) {
          dataYoy[key] = doc.yoy[key];
        }

        for (const item of kelompok.sub) {
          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(yoy)
          ) {
            if (!subDataYoy[item.val]) subDataYoy[item.val] = {};
            subDataYoy[item.val][key] = doc.yoy[key];
          }

          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(yoy) &&
            Number(keyMonth) === Number(month)
          ) {
            subYoy[item.val] = {
              label: item.label,
              value: doc.yoy[key],
              bulan: Number(keyMonth),
              data: sort(subDataYoy)[item.val],
            };
          }
        }
      }
    }

    const sortedResultYoy = sort(resultYoy);
    const mainDataYoy =
      sortedResultYoy && sortedResultYoy.length > 0 ? sortedResultYoy[0] : null;

    yoyItem = {
      label: komoditasItem.nama,
      value: mainDataYoy ? mainDataYoy.value : 0,
      bulan: mainDataYoy ? Number(mainDataYoy.bulan) : Number(month),
      data: sort(dataYoy),
      sub: subYoy,
    };
  }

  // Process YoY2 data
  let yoy2Item = null;
  if (doc.yoy2) {
    const resultYoy2 = [];
    const subYoy2 = {};
    const dataYoy2 = {};
    const subDataYoy2 = {};

    for (const key in doc.yoy2) {
      const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
      const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
      const keyMonth = key.slice(regionVal.length + 11);

      if (
        key.startsWith(regionVal) &&
        key.slice(regionVal.length, regionVal.length + 1) === "2" &&
        Number(keyMonth) === Number(month) &&
        Number(keyYear) === Number(yoy2)
      ) {
        resultYoy2.push({
          key,
          value: doc.yoy2[key],
          bulan: keyMonth,
        });
      }

      for (const kelompok of varKelompokIHK) {
        if (
          key.startsWith(regionVal) &&
          turvar === String(kelompok.turvar) &&
          Number(keyYear) === Number(yoy2)
        ) {
          dataYoy2[key] = doc.yoy2[key];
        }

        for (const item of kelompok.sub) {
          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(yoy2)
          ) {
            if (!subDataYoy2[item.val]) subDataYoy2[item.val] = {};
            subDataYoy2[item.val][key] = doc.yoy2[key];
          }

          if (
            key.startsWith(regionVal) &&
            turvar === String(item.val) &&
            Number(keyYear) === Number(yoy2) &&
            Number(keyMonth) === Number(month)
          ) {
            subYoy2[item.val] = {
              label: item.label,
              value: doc.yoy2[key],
              bulan: Number(keyMonth),
              data: sort(subDataYoy2)[item.val],
            };
          }
        }
      }
    }

    const sortedResultYoy2 = sort(resultYoy2);
    const mainDataYoy2 =
      sortedResultYoy2 && sortedResultYoy2.length > 0 ? sortedResultYoy2[0] : null;

    yoy2Item = {
      label: komoditasItem.nama,
      value: mainDataYoy2 ? mainDataYoy2.value : 0,
      bulan: mainDataYoy2 ? Number(mainDataYoy2.bulan) : Number(month),
      data: sort(dataYoy2),
      sub: subYoy2,
    };
  }

  return { hierarki, yoyItem, yoy2Item };
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
 * @returns {Object} Data komoditas dengan hierarki dan YoY
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

  const { month, year, yoy, yoy2 } = getDateInfo();
  let hierarki = [];
  let yoyList = [];
  let yoy2List = [];
  let biggest = null;

  // Process setiap komoditas
  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      yoy,
      yoy2,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.yoyItem) {
        yoyList.push(result.yoyItem);
      }
      if (result.yoy2Item) {
        yoy2List.push(result.yoy2Item);
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

  // Format sub-komoditas untuk YoY
  for (const key in yoyList) {
    const subsObjYoy = yoyList[key].sub || {};
    yoyList[key].sub = Object.entries(subsObjYoy)
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

  // Format sub-komoditas untuk YoY2
  for (const key in yoy2List) {
    const subsObjYoy2 = yoy2List[key].sub || {};
    yoy2List[key].sub = Object.entries(subsObjYoy2)
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

  const top5Yoy = [...yoyList]
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
    yoy: yoyList,
    yoy2: yoy2List,
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

  const { month, year, yoy, yoy2 } = getDateInfo();
  let hierarki = [];
  let yoyList = [];
  let yoy2List = [];
  let biggest = null;

  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      resolvedKota,
      month,
      year,
      yoy,
      yoy2,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.yoyItem) {
        yoyList.push(result.yoyItem);
      }
      if (result.yoy2Item) {
        yoy2List.push(result.yoy2Item);
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

  for (const key in yoyList) {
    const subsObjYoy = yoyList[key].sub || {};
    yoyList[key].sub = Object.entries(subsObjYoy)
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

  for (const key in yoy2List) {
    const subsObjYoy2 = yoy2List[key].sub || {};
    yoy2List[key].sub = Object.entries(subsObjYoy2)
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

  const top5Yoy = [...yoyList]
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
    yoy: yoyList,
    yoy2: yoy2List,
    biggest,
    top5Mom,
    top5Yoy,
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
