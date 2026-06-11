import UserActivity from "../../db/models/UserActivity.js";

/**
 * Log a user activity
 */
export const logActivity = async (userId, activityName) => {
  if (!userId || !activityName) {
    throw new Error("userId dan activityName wajib diisi");
  }

  const activity = new UserActivity({
    userId,
    activityName,
  });

  await activity.save();
  return activity;
};

/**
 * Get activity history of a user
 */
export const getUserActivities = async (userId) => {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }

  return await UserActivity.find({ userId }).sort({ createdAt: -1 }).lean();
};
