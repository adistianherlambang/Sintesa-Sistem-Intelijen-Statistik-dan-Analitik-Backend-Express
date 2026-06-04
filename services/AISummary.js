import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

//controller
import { getInflasiByKota } from "../controller/dashboard/inflasiController.js";

//json
import kota from "../json/kota.json" with {type: "json"}

dotenv.config();

import APIDataBPS from "../db/models/APIDataBPS.js";
import { type } from "os";

dotenv.config({
  path: path.resolve("../.env"),
});

export const AISummary = async () => {
  try {

    const date = new Date()
    const month = date.getMonth()
    const previousMonth = Number(month) - 1
    const year = date.getFullYear()
    const previousYear = Number(year) - 1

    for(const key in kota) {
      console.log(kota)
    }
  } catch (err) {
    console.error(err.message);
  }
};

AISummary()