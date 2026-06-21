import BillingTransaction from "../../db/models/BillingTransaction.js";
import Subscription from "../../db/models/Subscription.js";
import {
  createBayarGGPayment,
  checkBayarGGPayment,
} from "../../services/paymentService.js";
import { logActivity } from "./activityController.js";

// Subscription Plans config
const PLANS = {
  wa_only_monthly: {
    name: "Bot WhatsApp Only (Bulanan)",
    amount: 50000,
    quota: 30,
    durationDays: 30,
  },
  wa_only_yearly: {
    name: "Bot WhatsApp Only (Tahunan)",
    amount: 500000,
    quota: 365,
    durationDays: 365,
  },
  wa_analisis_monthly: {
    name: "Bot WhatsApp + Analisis (Bulanan)",
    amount: 60000,
    quota: 10,
    durationDays: 30,
  },
  wa_analisis_yearly: {
    name: "Bot WhatsApp + Analisis (Tahunan)",
    amount: 600000,
    quota: 10,
    durationDays: 365,
  },
};

/**
 * Initiate subscription upgrade and generate payment QRIS
 */
export const initiatePayment = async (userId, planId) => {
  if (!userId || !planId) {
    throw new Error("userId dan planId wajib diisi");
  }

  const plan = PLANS[planId];
  if (!plan) {
    throw new Error("Paket langganan tidak valid");
  }

  // 1. Create a pending Subscription (not active yet)
  const expiredAt = new Date();
  expiredAt.setDate(expiredAt.getDate() + plan.durationDays);

  const pendingSub = new Subscription({
    userId,
    subscriptionId: planId,
    status: "pending",
    startedAt: new Date(),
    expiredAt,
    quota: plan.quota,
  });
  await pendingSub.save();

  // 2. Call bayar.gg payment service
  const description = `Pembayaran Upgrade Paket ${plan.name}`;
  const paymentData = await createBayarGGPayment(plan.amount, description);

  // 3. Create a pending BillingTransaction
  const transaction = new BillingTransaction({
    userId,
    subscriptionId: pendingSub._id,
    invoiceId: paymentData.invoice_id,
    amount: plan.amount,
    finalAmount: paymentData.final_amount,
    paymentUrl: paymentData.payment_url,
    qrisImageUrl:
      paymentData.qris_dynamic_image_url || paymentData.qris_static_image_url,
    status: "pending",
  });
  await transaction.save();

  await logActivity(userId, `Menunggu pembayaran paket: ${plan.name}`);


  return {
    transaction,
    payment: {
      invoiceId: paymentData.invoice_id,
      finalAmount: paymentData.final_amount,
      paymentUrl: paymentData.payment_url,
      qrisImageUrl:
        paymentData.qris_dynamic_image_url || paymentData.qris_static_image_url,
      expiresAt: paymentData.expires_at,
    },
  };
};

/**
 * Check payment status of an invoice and activate subscription if paid
 */
export const verifyPayment = async (userId, invoiceId) => {
  if (!userId || !invoiceId) {
    throw new Error("userId dan invoiceId wajib diisi");
  }

  const transaction = await BillingTransaction.findOne({ invoiceId });
  if (!transaction) {
    throw new Error("Invoice tidak ditemukan");
  }

  if (transaction.userId.toString() !== userId.toString()) {
    throw new Error("Akses ditolak. Invoice bukan milik Anda.");
  }

  // If already paid, return early
  if (transaction.status === "paid") {
    const sub = await Subscription.findById(transaction.subscriptionId);
    return { transaction, subscription: sub };
  }

  // Call check-payment bayar.gg API
  const checkData = await checkBayarGGPayment(invoiceId);

  if (checkData.status === "paid") {
    // 1. Update Transaction to paid
    transaction.status = "paid";
    transaction.paidAt = checkData.paid_at
      ? new Date(checkData.paid_at)
      : new Date();
    await transaction.save();

    // 2. Find and activate Subscription
    const subscription = await Subscription.findById(
      transaction.subscriptionId,
    );
    if (subscription) {
      // Deactivate any other active subscriptions
      await Subscription.updateMany(
        { userId, status: "active", _id: { $ne: subscription._id } },
        { $set: { status: "expired" } },
      );

      subscription.status = "active";
      subscription.startedAt = new Date();

      const plan = PLANS[subscription.subscriptionId];
      if (plan) {
        const expiredAt = new Date();
        expiredAt.setDate(expiredAt.getDate() + plan.durationDays);
        subscription.expiredAt = expiredAt;
        subscription.quota = plan.quota;
      }
      await subscription.save();

      await logActivity(
        userId,
        `Pembayaran berhasil. Paket ${plan ? plan.name : subscription.subscriptionId} aktif.`,
      );
      return { transaction, subscription };
    }
  }

  return {
    transaction,
    message: `Status pembayaran saat ini: ${checkData.status}`,
  };
};

/**
 * Get billing transactions history for a user
 */
export const getBillingHistory = async (userId) => {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }

  return await BillingTransaction.find({ userId })
    .populate("subscriptionId")
    .sort({ createdAt: -1 })
    .lean();
};
