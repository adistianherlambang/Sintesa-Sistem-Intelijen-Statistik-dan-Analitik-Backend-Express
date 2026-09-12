import express, { response } from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//api
import api from "./api/api.js";

//cron
import { startBPSCron } from "./cronjob/cronBPSAPI.js";

// WhatsApp Bot service reconnect helpers
import {
  initializeWhatsAppClient,
  cleanupAllClients,
} from "./services/whatsappService.js";
import WhatsAppSession from "./db/models/WhatsAppSession.js";

//db
import { connectDB } from "./db/mongo.js";

dotenv.config();

//konek MONGODB
await connectDB();

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
      { $set: { status: "disconnected", qrCode: "" } },
    );
    if (resetResult.modifiedCount > 0) {
      console.log(
        `[Startup] Reset ${resetResult.modifiedCount} stale connecting sessions to disconnected.`,
      );
    }

    // Reconnect only previously connected active sessions
    const activeSessions = await WhatsAppSession.find({ status: "connected" });
    console.log(
      `Auto-reconnecting ${activeSessions.length} active WhatsApp sessions...`,
    );

    // Stagger client initialization to prevent CPU/RAM spikes on boot
    for (let i = 0; i < activeSessions.length; i++) {
      const session = activeSessions[i];
      setTimeout(() => {
        console.log(
          `[Startup] Initializing auto-reconnect for user ${session.userId}...`,
        );
        initializeWhatsAppClient(session.userId).catch((err) => {
          console.error(
            `Failed auto-reconnect for user ${session.userId}:`,
            err.message,
          );
        });
      }, i * 5000); // 5 seconds interval
    }
  } catch (err) {
    console.error("Error auto-reconnecting WhatsApp sessions:", err.message);
  }
};
await reconnectActiveSessions();

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile) or any frontend origin dynamically
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    optionsSuccessStatus: 200,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve Word Editor Engine directly from frontend/src/word/engine
const WORD_ENGINE_CANDIDATES = [
  path.resolve(__dirname, "../frontend/src/word/engine"),
  path.resolve(__dirname, "frontend/src/word/engine"),
];
const WORD_ENGINE_DIR = WORD_ENGINE_CANDIDATES.find((p) => fs.existsSync(p));
if (WORD_ENGINE_DIR) {
  app.use("/word-editor", express.static(WORD_ENGINE_DIR));
  console.log(`[Server] Word Editor Engine mounted at /word-editor from ${WORD_ENGINE_DIR}`);
}

// Serve exported analysis files
const EXPORT_DIR = path.resolve(__dirname, "export/analysis_files");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}
app.use("/analysis-files", express.static(EXPORT_DIR));

app.use("/api", api);

startBPSCron();

const port = parseInt(process.env.PORT, 10) || 5000;

app.listen(port, () => {
  console.log("App jalan di ", port);
});

// Trigger nodemon reload - server boots and re-initializes client. v6
