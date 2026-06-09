import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../db/models/User.js";

dotenv.config({ path: "../.env" });

async function check() {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/sintesa";
    await mongoose.connect(mongoUrl);
    
    const users = await User.find({ location: { $ne: null } });
    
    if (users.length === 0) {
      console.log("Belum ada wilayah/kota yang diklaim.");
    } else {
      console.log("=== DAFTAR WILAYAH/KOTA YANG SUDAH DIKLAIM ===");
      users.forEach((user, index) => {
        console.log(`${index + 1}. Kota/Kabupaten: ${user.location?.name || "Tidak diketahui"}`);
        console.log(`   ID Wilayah: ${user.location?.id}`);
        console.log(`   Nama Instansi: ${user.profile?.name || "Tidak diisi"}`);
        console.log(`   Email Admin: ${user.email}`);
        console.log("----------------------------------------------");
      });
    }
  } catch (err) {
    console.error("Gagal melakukan pengecekan:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

check();
