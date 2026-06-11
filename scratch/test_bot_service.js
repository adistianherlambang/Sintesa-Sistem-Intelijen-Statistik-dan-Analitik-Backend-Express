import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  initializeWhatsAppClient,
  getActiveClient,
} from "../services/whatsappService.js";
import WhatsAppSession from "../db/models/WhatsAppSession.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const userId = "6a266560829188d02cde63fa";

  // Reset session status to disconnected first to ensure a clean slate
  console.log("Resetting WhatsApp session status to disconnected...");
  await WhatsAppSession.findOneAndUpdate(
    { userId },
    { status: "disconnected", qrCode: "" },
  );

  console.log(`Initializing WhatsApp client for user ${userId}...`);
  const client = await initializeWhatsAppClient(userId);

  client.on("qr", () => {
    console.log(
      "EVENT: QR received! Please open frontend, refresh session, and scan.",
    );
  });

  client.on("authenticated", () => {
    console.log("EVENT: Authenticated successfully!");
  });

  client.on("ready", () => {
    console.log("EVENT: Ready! Bot is now listening to messages.");
  });

  client.on("disconnected", (reason) => {
    console.log("EVENT: Disconnected! Reason:", reason);
  });

  client.on("auth_failure", (msg) => {
    console.log("EVENT: Auth Failure! Msg:", msg);
  });

  client.on("message", (msg) => {
    console.log(`EVENT: Message received from ${msg.from}: "${msg.body}"`);
  });

  // Keep script running
  console.log("Diagnostics script is running. Watching events...");
};

run().catch(console.error);
