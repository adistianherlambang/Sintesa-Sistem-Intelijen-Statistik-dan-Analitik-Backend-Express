import mongoose from "mongoose";

const PackagePlanSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "WhatsApp Bot",
    },
    amount: {
      type: Number,
      required: true,
      default: 50000,
    },
    quota: {
      type: Number,
      required: true,
      default: 30,
    },
    durationDays: {
      type: Number,
      required: true,
      default: 30,
    },
    features: {
      type: [String],
      default: [],
    },
    badge: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("PackagePlan", PackagePlanSchema);
