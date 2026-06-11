import mongoose from "mongoose";
import crypto from "crypto";

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      default: () => crypto.randomUUID(),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    profile: {
      name: { type: String, default: "" },
      avatar: { type: String, default: "" },
      instansiType: { type: String, default: "" },
      picName: { type: String, default: "" },
      picPhone: { type: String, default: "" },
    },
    location: {
      type: mongoose.Schema.Types.Mixed, // Stores full object from kota.json
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    token: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", UserSchema);
