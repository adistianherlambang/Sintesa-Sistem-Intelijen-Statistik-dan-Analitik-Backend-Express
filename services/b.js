import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cloudscraper from "cloudscraper";
import { fileURLToPath } from "url";

import APIDataBPS from "../db/models/APIDataBPS.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Kunci jalur .env secara absolut ke folder root
const rootEnvPath = path.join(__dirname, "..", ".env");
dotenv.config({
  path: rootEnvPath,
});

const json = JSON.parse(fs.readFileSync("../json/kota.json", "utf-8"))

const date = new Date().toISOString().split("T")[0]
const [year, month, day] = date.split("-");

export const fetchBI = async () => {
  try {

    //mongo
    // const doc = await APIDataBPS.findOne({
    //   "var.val": 2223,
    //   "turvar.val": 1551
    // })

    for (let i in json) {
      const kota = json[i].BIKota.id
      const prov = json[i].BIProvinsi.id

      if (kota === undefined) {
        continue
      }

      const url = `https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah?price_type_id=2&comcat_id=&province_id=${prov}&regency_id=${kota}&market_id=&tipe_laporan=1&start_date=${year}-${month - 1}-${day - 1}&end_date=${date}&_=1784599800743`

      console.log(url)

      //fetch
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Sec-Fetch-Site": "same-origin",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "en-SG,en-GB;q=0.9,en;q=0.8",
          "Sec-Fetch-Mode": "cors",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15",
          "Connection": "keep-alive",
          "Cookie": "TS0184e56b=01374ae98bf5ffd2733f778d757b1abc80144eee1db0dd7c465431cfd8010ad46882c418e6387c6e6b934894552b22798190d62af652b0b9358efc2152e0c6ace5ada6a4d0; WSAntiforgeryCookie=CfDJ8N-QLJog7P5LgWcbQd7oXv9YEZ33XV3O79qYaZWCkwyzwHziAEyVlakUGEq_h0Gzo7gdsPwDg5SpXeZ5HagHYVQE46OyIp7bEgQT6Md1UxWXzO-pSjP_YrIfmxF7WmPHGFlkPOadFEziWU-8frO67Ko; TScada0de9027=08efd2ca8eab20001f0ba9a55710e107e9f31e93360bc5fb089240b68c05ce9c2b97ebc89f682de108356ad2b8113000607ff2cf971cfb6d20d73f769aab0d2321a83fd2d0de0de537d34f2e0da68bf5973a52d0d56011890c25b7b8e53a9244; TS01669f1e=01374ae98bf4686ee81328e6df8623b44d1d23adf1b0dd7c465431cfd8010ad46882c418e6f7a84bcff6f647a4c72d8b99ebe67c62",
          "Sec-Fetch-Dest": "empty",
          "X-Requested-With": "XMLHttpRequest",
          "Priority": "u=3, i",
          "XSRF-TOKEN": "CfDJ8N-QLJog7P5LgWcbQd7oXv-xcvtjIcge3ZBzNwdrKKoRrimZgXC4I_hS8dPGH4blCxFHzcdH1Vm6z-N9HN_LQU4FOqJSiiBTSg5BefcVW2RWRL3walmo2uuJBHwuQJ-c0cL7iyNJQqz06Fv3M2kt8GM"
        }
      });

      const data = await response.json();

      const result = data.data
        .filter(item => item.level === 1)
        .map(item => {
          const dateKeys = Object.keys(item).filter(key =>
            /^\d{2}\/\d{2}\/\d{4}$/.test(key)
          );

          const secondLastDate = dateKeys.at(-2);

          return {
            name: item.name,
            value: item[secondLastDate],
            awal: item[dateKeys[0]]
          };
        });

      console.log(result);

      //mongo

    }

  } catch (error) {
    console.error(error)
  }
}

fetchBI()