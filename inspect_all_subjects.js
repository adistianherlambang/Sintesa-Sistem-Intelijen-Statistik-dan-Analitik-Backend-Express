import mongoose from "mongoose";
import dotenv from "dotenv";
import APIDataBPS from "./db/models/APIDataBPS.js";

dotenv.config();

const check = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const docs = await APIDataBPS.find({}, "var").lean();
  docs.forEach((doc, idx) => {
    console.log(`Doc ${idx}:`, doc.var);
  });

  await mongoose.disconnect();
};

check();
