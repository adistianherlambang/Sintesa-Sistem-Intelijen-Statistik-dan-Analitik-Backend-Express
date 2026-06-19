import mongoose from "mongoose";
import dotenv from "dotenv";
import APIDataBPS from "./db/models/APIDataBPS.js";

dotenv.config();

const check = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  // Let's print the entire doc of var.val = 1 (Inflasi) but only structure of keys
  const docInflasi = await APIDataBPS.findOne({ "var.val": 1 }).lean();
  if (docInflasi) {
    console.log("datacontent keys count:", Object.keys(docInflasi.datacontent).length);
    console.log("yoy keys count:", docInflasi.yoy ? Object.keys(docInflasi.yoy).length : 0);
    
    // Check if there is any other document for inflation YoY
    // Let's search all documents where var.label contains "YoY" or "Year-on-Year" or "yoy"
    const allDocs = await APIDataBPS.find({}).lean();
    allDocs.forEach((d, idx) => {
      d.var.forEach(v => {
        if (v.label.toLowerCase().includes("yoy") || v.label.toLowerCase().includes("year")) {
          console.log(`Found matching var in doc ${idx}:`, v);
        }
      });
    });
  }

  await mongoose.disconnect();
};

check();
