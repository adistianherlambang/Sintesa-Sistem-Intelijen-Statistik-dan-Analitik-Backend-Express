import mongoose from "mongoose";
import dotenv from "dotenv";
import APIDataBPS from "./db/models/APIDataBPS.js";

dotenv.config();

const check = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const docIhk = await APIDataBPS.findOne({ "var.val": 2245 }).lean();
  if (docIhk) {
    const bandungRegion = docIhk.vervar.find(r => r.label.includes("BANDUNG"));
    if (bandungRegion) {
      const reg = bandungRegion.val.toString();
      console.log("Bandung regionVal:", reg);
      
      const dcKeys = Object.keys(docIhk.datacontent).filter(k => k.startsWith(reg));
      console.log("Datacontent keys for Bandung:", dcKeys);
      
      if (docIhk.yoy) {
        const yoyKeys = Object.keys(docIhk.yoy).filter(k => k.startsWith(reg));
        console.log("YoY keys for Bandung:", yoyKeys);
        
        // Print some values
        yoyKeys.forEach(k => {
          console.log(`YoY key ${k}: ${docIhk.yoy[k]}`);
        });
      } else {
        console.log("No YoY section in IHK document");
      }
    }
  }

  await mongoose.disconnect();
};

check();
