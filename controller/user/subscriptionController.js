import Subscription from "../../db/models/Subscription.js";

/**
 * Create or update a subscription for a user
 */
export const createOrUpdateSubscription = async (userId, planId, quota = 10, durationDays = 30) => {
  if (!userId || !planId) {
    throw new Error("userId dan planId wajib diisi");
  }

  const startedAt = new Date();
  const expiredAt = new Date();
  expiredAt.setDate(startedAt.getDate() + durationDays);

  // Deactivate any existing active subscriptions first
  await Subscription.updateMany(
    { userId, status: "active" },
    { $set: { status: "expired" } }
  );

  const subscription = new Subscription({
    userId,
    subscriptionId: planId,
    status: "active",
    startedAt,
    expiredAt,
    quota,
  });

  await subscription.save();
  return subscription;
};

/**
 * Get the current active subscription of a user (verifying expiry)
 */
export const getSubscriptionStatus = async (userId) => {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }

  const subscription = await Subscription.findOne({ userId, status: "active" });
  if (!subscription) {
    return { status: "none", message: "Tidak memiliki langganan aktif" };
  }

  // Check if expired
  if (new Date() > new Date(subscription.expiredAt)) {
    subscription.status = "expired";
    await subscription.save();
    return { status: "expired", message: "Langganan Anda telah kedaluwarsa" };
  }

  return subscription;
};

/**
 * Consume quota for a user activity
 */
export const consumeSubscriptionQuota = async (userId) => {
  const sub = await Subscription.findOne({ userId, status: "active" });
  if (!sub) {
    throw new Error("Tidak memiliki langganan aktif");
  }

  if (new Date() > new Date(sub.expiredAt)) {
    sub.status = "expired";
    await sub.save();
    throw new Error("Langganan Anda telah kedaluwarsa");
  }

  if (sub.quota <= 0) {
    throw new Error("Kuota langganan Anda telah habis");
  }

  sub.quota -= 1;
  await sub.save();
  return sub;
};
