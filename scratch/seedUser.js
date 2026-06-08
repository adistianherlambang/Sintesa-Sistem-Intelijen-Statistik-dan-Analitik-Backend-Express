import mongoose from "mongoose";
import dotenv from "dotenv";
import { registerUser } from "../controller/user/userController.js";

dotenv.config({ path: "../.env" });

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/sintesa");
    console.log("DB terhubung...");

    const email = "admin@bps.go.id";
    const password = "password123";
    const name = "BPS Kota Metro";
    const cityChoice = "metro";

    console.log(`Mencoba mendaftarkan user dummy: ${email}...`);
    try {
      const user = await registerUser(email, password, name, cityChoice);
      console.log("User dummy berhasil dibuat:", user);
    } catch (err) {
      if (err.message.includes("Email sudah terdaftar")) {
        console.log("User dummy sudah terdaftar.");
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error("Gagal melakukan seeding:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
