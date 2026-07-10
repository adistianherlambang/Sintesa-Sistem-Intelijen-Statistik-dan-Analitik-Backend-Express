import mongoose from "mongoose";

const WhatsAppSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["disconnected", "connecting", "connected"],
      default: "disconnected",
    },
    qrCode: {
      type: String, // base64 string QR image
      default: "",
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    sessionId: {
      type: String,
      default: "",
    },
    lastSync: {
      type: Date,
      default: null,
    },
    incomingCountToday: {
      type: Number,
      default: 0,
    },
    repliedCountToday: {
      type: Number,
      default: 0,
    },
    totalMessageCount: {
      type: Number,
      default: 0,
    },
    botEnabled: {
      type: Boolean,
      default: true,
    },
    activeTimeStart: {
      type: String, // HH:MM format
      default: "00:00",
    },
    activeTimeEnd: {
      type: String, // HH:MM format
      default: "23:59",
    },
    lastResetDate: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

export default mongoose.model("WhatsAppSession", WhatsAppSessionSchema);
