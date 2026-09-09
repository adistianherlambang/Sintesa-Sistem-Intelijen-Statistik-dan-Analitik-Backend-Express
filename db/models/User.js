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
      required: [true, "Email wajib diisi"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v || typeof v !== "string") return false;
          const trimmed = v.trim();
          if (trimmed.length > 254) return false;
          const emailRegex =
            /^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
          return emailRegex.test(trimmed);
        },
        message: (props) =>
          `Format email "${props.value}" tidak valid. Harap gunakan format email yang benar (contoh: nama@domain.com)`,
      },
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
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", UserSchema);
