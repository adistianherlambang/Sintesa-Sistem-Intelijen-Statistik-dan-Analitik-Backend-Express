import mongoose from "mongoose";
import dotenv from "dotenv";
import e from "express";

//models
import APIDataBPS from "../db/models/APIDataBPS.js";

//json
import varKelompokIHK from "../json/verKelompokIHK.json" with { type: "json" };

const router = e.Router();

const date = new Date();
const month = date.getMonth();
const year = "1" + String(date.getFullYear()).slice(2, 4);
const yoy = year - 1;

const sort = (itemSorted) => {
  // jika array
  if (Array.isArray(itemSorted)) {
    return [...itemSorted].sort((a, b) => Number(a.key) - Number(b.key));
  }

  // jika object
  return Object.fromEntries(
    Object.entries(itemSorted).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
};

const Get = async () => {
  try {
    const { kota } = {
      kota: "KOTA METRO",
    };

    if (!kota) {
      return console.log({
        message: "kota wajib diisi",
      });
    }

    let hierarki = [];

    let totalKomoditas = 0;
    let biggest = 0;

    let val;

    for (const i in varKelompokIHK) {
      const doc = await APIDataBPS.findOne({
        "var.val": varKelompokIHK[i].var,
        "turvar.val": varKelompokIHK[i].turvar,
      })
        .select("var vervar datacontent")
        .lean();

      const region = doc.vervar.find((item) => item.label === kota);
      const regionVal = region.val.toString();

      // filter datacontent
      const result = [];
      const sub = {};
      const data = {};
      const subData = {};
      let dataYoy;

      for (const key in doc.datacontent) {
        // ambil turvar
        const turvar = key.slice(regionVal.length + 4, regionVal.length + 8);
        const keyYear = key.slice(regionVal.length + 8, regionVal.length + 11);
        const keyMonth = key.slice(regionVal.length + 11);

        // data utama
        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2" &&
          keyMonth === String(month) &&
          keyYear === String(year)
        ) {
          result.push({
            key,
            value: doc.datacontent[key],
            bulan: keyMonth,
          });
        }

        if (
          key.startsWith(regionVal) &&
          key.slice(regionVal.length, regionVal.length + 1) === "2" &&
          keyMonth === String(month) &&
          keyYear === String(yoy)
        ) {
          result.push({
            key,
            yoy: doc.datacontent[key],
          });
        }

        for (const kelompok of varKelompokIHK) {
          if (
            key.startsWith(regionVal) &&
            turvar === String(kelompok.turvar) &&
            keyYear === String(year)
          ) {
            data[key] = doc.datacontent[key];
          }

          for (const item of kelompok.sub) {
            if (
              key.startsWith(regionVal) &&
              turvar === String(item.val) &&
              keyYear === String(year)
            ) {
              if (!subData[item.val]) {
                subData[item.val] = {};
              }
              subData[item.val][key] = doc.datacontent[key];
            }

            if (
              key.startsWith(regionVal) &&
              turvar === String(item.val) &&
              keyYear === String(year) &&
              keyMonth === String(month)
            ) {
              // overwrite data lama
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

      hierarki.push({
        label: varKelompokIHK[i].nama,
        value: sort(result)[0].value,
        bulan: Number(sort(result)[0].bulan),
        yoy: sort(result)[0].yoy,
        data: sort(data),
        sub: sub,
      });

      biggest = [...hierarki].sort((a, b) => Number(a) - Number(b))[
        hierarki.length - 1
      ];
    }

    for (const key in hierarki) {
      // convert sub object keyed by kode into an array of sub-items (drop kode)
      const subsObj = hierarki[key].sub || {};
      hierarki[key].sub = Object.entries(subsObj)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => {
          return {
            label: v.label,
            value: v.value,
            bulan: v.bulan,
            data: Object.fromEntries(
              Object.entries(v.data || {}).sort((x, y) => Number(x[0]) - Number(y[0])),
            ),
          };
        });
    }

    const log = ({
      totalKomoditas: varKelompokIHK.length,
      hierarki,
      biggest,
    })

    console.log(JSON.stringify(log, null, 2))

  } catch (err) {
    console.error(err.message)
  }
};

Get()