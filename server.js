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
import { initializeWhatsAppClient, cleanupAllClients } from "./services/whatsappService.js";
import WhatsAppSession from "./db/models/WhatsAppSession.js";

dotenv.config();

//konek MONGODB
await mongoose.connect(process.env.MONGO_URL);
console.log("Mongodb Connected");

// Handle exit events cleanly to destroy WhatsApp puppeteer browser instances
const handleExit = async (signal) => {
  console.log(`\n[Server] Received ${signal}. Cleaning up WhatsApp clients...`);
  try {
    await cleanupAllClients();
  } catch (err) {
    console.error("Error during WhatsApp clients cleanup:", err.message);
  }
  process.exit(0);
};

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));

// Auto-reconnect active WhatsApp sessions on startup
const reconnectActiveSessions = async () => {
  try {
    // Reset connecting status to disconnected on startup to prevent headless browsers hanging forever
    const resetResult = await WhatsAppSession.updateMany(
      { status: "connecting" },
      { $set: { status: "disconnected", qrCode: "" } }
    );
    if (resetResult.modifiedCount > 0) {
      console.log(`[Startup] Reset ${resetResult.modifiedCount} stale connecting sessions to disconnected.`);
    }

    // Reconnect only previously connected active sessions
    const activeSessions = await WhatsAppSession.find({ status: "connected" });
    console.log(`Auto-reconnecting ${activeSessions.length} active WhatsApp sessions...`);
    
    // Stagger client initialization to prevent CPU/RAM spikes on boot
    for (let i = 0; i < activeSessions.length; i++) {
      const session = activeSessions[i];
      setTimeout(() => {
        console.log(`[Startup] Initializing auto-reconnect for user ${session.userId}...`);
        initializeWhatsAppClient(session.userId).catch((err) => {
          console.error(`Failed auto-reconnect for user ${session.userId}:`, err.message);
        });
      }, i * 5000); // 5 seconds interval
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

// Trigger nodemon reload - server boots and re-initializes client. v5
