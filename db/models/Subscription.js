import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriptionId: {
      type: String, // Plan / Sub ID (e.g., 'premium_monthly', 'basic')
      required: true,
    },
    status: {
      type: String, // 'active', 'expired', 'pending'
      required: true,
      default: "pending",
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiredAt: {
      type: Date,
      required: true,
    },
    quota: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("Subscription", SubscriptionSchema);
