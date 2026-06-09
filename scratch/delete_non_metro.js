import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../db/models/User.js";

dotenv.config({ path: "../.env" });

async function clean() {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/sintesa";
    await mongoose.connect(mongoUrl);
    
    // Delete all users whose location.id is not "metro"
    const result = await User.deleteMany({ "location.id": { $ne: "metro" } });
    
    console.log(`Pembersihan database selesai.`);
    console.log(`Jumlah user yang dihapus: ${result.deletedCount}`);
    
    // Log remaining users
    const remaining = await User.find({});
    console.log("User tersisa di database:");
    remaining.forEach(u => {
      console.log(`- Email: ${u.email}, Instansi: ${u.profile?.name}, Wilayah: ${u.location?.name}`);
    });
  } catch (err) {
    console.error("Gagal membersihkan database:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

clean();
