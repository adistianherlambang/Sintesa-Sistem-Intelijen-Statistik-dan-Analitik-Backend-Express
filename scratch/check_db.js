import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../db/models/User.js";
import Subscription from "../db/models/Subscription.js";
import WhatsAppSession from "../db/models/WhatsAppSession.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  const users = await User.find({});
  console.log(`\n=== Users found: ${users.length} ===`);
  for (const u of users) {
    console.log(`User: ${u.email} (ID: ${u._id})`);
    
    const sub = await Subscription.findOne({ userId: u._id, status: "active" });
    console.log(`  Active Subscription:`, sub ? {
      subscriptionId: sub.subscriptionId,
      status: sub.status,
      quota: sub.quota,
      expiredAt: sub.expiredAt
    } : "None");

    const session = await WhatsAppSession.findOne({ userId: u._id });
    console.log(`  WhatsApp Session:`, session ? {
      status: session.status,
      phoneNumber: session.phoneNumber,
      botEnabled: session.botEnabled,
      totalMessageCount: session.totalMessageCount,
      activeTimeStart: session.activeTimeStart,
      activeTimeEnd: session.activeTimeEnd,
      qrCodeLength: session.qrCode ? session.qrCode.length : 0
    } : "None");
  }

  await mongoose.disconnect();
};

run().catch(console.error);
