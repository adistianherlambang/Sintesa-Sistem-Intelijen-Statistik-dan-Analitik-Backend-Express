import express, { response } from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import https from "https";

//api
import api from "./api/api.js";

//cron
import { startBPSCron } from "./cronjob/cronBPSAPI.js";

// WhatsApp Bot service reconnect helpers
import { initializeWhatsAppClient } from "./services/whatsappService.js";
import WhatsAppSession from "./db/models/WhatsAppSession.js";

dotenv.config();

//konek MONGODB
await mongoose.connect(process.env.MONGO_URL);
console.log("Mongodb Connected");

// Auto-reconnect active WhatsApp sessions on startup
const reconnectActiveSessions = async () => {
  try {
    const activeSessions = await WhatsAppSession.find({ status: { $in: ["connected", "connecting"] } });
    console.log(`Auto-reconnecting ${activeSessions.length} active WhatsApp sessions...`);
    for (const session of activeSessions) {
      initializeWhatsAppClient(session.userId).catch((err) => {
        console.error(`Failed auto-reconnect for user ${session.userId}:`, err.message);
      });
    }
  } catch (err) {
    console.error("Error auto-reconnecting WhatsApp sessions:", err.message);
  }
};
await reconnectActiveSessions();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", api);

startBPSCron();

const port = process.env.PORT;
app.listen(port, () => {
  console.log("App jalan di ", port);
});
