import mongoose from "mongoose";

const InfografisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pages: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    preview: {
      type: String,
      default: null,
    },
    canvasSize: {
      w: { type: Number, default: 1080 },
      h: { type: Number, default: 1080 },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Infografis", InfografisSchema);
