import mongoose from "mongoose";
import dotenv from "dotenv";
import APIDataBPS from "./db/models/APIDataBPS.js";

dotenv.config();

const check = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const docInflasi = await APIDataBPS.findOne({ "var.val": 1 }).lean();
  if (docInflasi) {
    const bandungRegion = docInflasi.vervar.find(r => r.label.includes("BANDUNG"));
    if (bandungRegion) {
      const reg = bandungRegion.val.toString();
      console.log("Bandung regionVal:", reg);
      
      const dcKeys = Object.keys(docInflasi.datacontent).filter(k => k.startsWith(reg));
      dcKeys.forEach(k => {
        console.log(`datacontent (MoM 2026) key ${k}: ${docInflasi.datacontent[k]}`);
      });
      
      if (docInflasi.yoy) {
        const yoyKeys = Object.keys(docInflasi.yoy).filter(k => k.startsWith(reg));
        yoyKeys.forEach(k => {
          console.log(`yoy (2025) key ${k}: ${docInflasi.yoy[k]}`);
        });
      }
    }
  }

  await mongoose.disconnect();
};

check();
