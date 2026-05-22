import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv"
import path from "path";

dotenv.config()

import APIDataBPS from "../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

const MONGO_URL = process.env.MONGO_URL;
await mongoose.connect(MONGO_URL);

export const AISum = async () => {
  try {

  } catch(err) {
    console.error(err.message)
  }
}