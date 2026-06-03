import APIDataBPS from "../../db/models/APIDataBPS.js";
import varKelompokIHK from "../../json/verKelompokIHK.json" with { type: "json" };
import { sort, getDateInfo } from "./helpers.js";

/**
 * Helper: Process komoditas data untuk satu item
 */
const processKomoditasItem = async (
  komoditasItem,
  kota,
  month,
  year,
  yoy,
) => {
  const doc = await APIDataBPS.findOne({
    "var.val": komoditasItem.var,
    "turvar.val": komoditasItem.turvar,
  })
    .select("var vervar datacontent yoy")
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
      sortedResultYoy && sortedResultYoy.length > 0
        ? sortedResultYoy[0]
        : null;

    yoyItem = {
      label: komoditasItem.nama,
      value: mainDataYoy ? mainDataYoy.value : 0,
      bulan: mainDataYoy ? Number(mainDataYoy.bulan) : Number(month),
      data: sort(dataYoy),
      sub: subYoy,
    };
  }

  return { hierarki, yoyItem };
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

  const { month, year, yoy } = getDateInfo();
  let hierarki = [];
  let yoyList = [];
  let biggest = null;

  // Process setiap komoditas
  for (const i in varKelompokIHK) {
    const result = await processKomoditasItem(
      varKelompokIHK[i],
      kota,
      month,
      year,
      yoy,
    );

    if (result) {
      hierarki.push(result.hierarki);
      if (result.yoyItem) {
        yoyList.push(result.yoyItem);
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

  // Cari komoditas dengan nilai terbesar
  if (hierarki.length > 0) {
    biggest = hierarki.reduce((max, item) => {
      const currentVal = parseFloat(item.value) || 0;
      const maxVal = parseFloat(max.value) || 0;
      return currentVal > maxVal ? item : max;
    }, hierarki[0]);
  }

  return {
    totalKomoditas: hierarki.length,
    hierarki,
    yoy: yoyList,
    biggest,
  };
};

/**
 * Pure function: Dapatkan dokumen komoditas lengkap
 * @returns {Object} Dokumen komoditas
 * @throws Error jika data tidak ditemukan
 */
export const getAllKomoditas = async () => {
  const doc = await APIDataBPS.findOne({
    "var.val": 2223,
  });

  if (!doc) {
    throw new Error("data komoditas tidak ditemukan");
  }

  return doc;
};
