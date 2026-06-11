import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../db/models/User.js";
import Subscription from "../db/models/Subscription.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const email = "admin@bps.go.id";
  const user = await User.findOne({ email });

  if (!user) {
    console.error(`User with email ${email} not found!`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found user: ${user.email} (ID: ${user._id})`);

  // Deactivate any existing active subscriptions
  await Subscription.updateMany(
    { userId: user._id, status: "active" },
    { $set: { status: "expired" } },
  );
  console.log("Expired existing active subscriptions.");

  // Create new active premium subscription for Bot WA + Analisis (Yearly)
  const expiredAt = new Date();
  expiredAt.setDate(expiredAt.getDate() + 365); // 1 year duration

  const premiumSub = new Subscription({
    userId: user._id,
    subscriptionId: "wa_analisis_yearly",
    status: "active",
    startedAt: new Date(),
    expiredAt: expiredAt,
    quota: 600, // Yearly quota
  });

  await premiumSub.save();
  console.log(
    `Successfully activated "Bot WA + Analisis (Tahunan)" package for ${user.email}!`,
  );

  // Verify
  const activeSub = await Subscription.findOne({
    userId: user._id,
    status: "active",
  });
  console.log("Active Subscription details:", activeSub);

  await mongoose.disconnect();
};

run().catch(console.error);
