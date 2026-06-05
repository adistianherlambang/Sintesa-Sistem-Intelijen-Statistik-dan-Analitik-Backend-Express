import mongoose from "mongoose";

const BillingTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    invoiceId: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      default: "pending", // 'pending', 'paid', 'expired'
    },
    paymentUrl: {
      type: String,
      default: "",
    },
    qrisImageUrl: {
      type: String,
      default: "",
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("BillingTransaction", BillingTransactionSchema);
