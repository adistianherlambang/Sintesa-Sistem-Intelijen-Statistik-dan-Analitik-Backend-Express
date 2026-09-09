import User from "../../db/models/User.js";
import Subscription from "../../db/models/Subscription.js";
import PackagePlan from "../../db/models/PackagePlan.js";
import SystemConfig from "../../db/models/SystemConfig.js";

/**
 * Express middleware to authenticate the user using a token
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res
        .status(401)
        .json({ message: "Akses ditolak. Token tidak disediakan." });
    }

    const user = await User.findOne({ token }).lean();

    if (!user) {
      return res
        .status(401)
        .json({ message: "Sesi tidak valid atau kedaluwarsa." });
    }

    // Attach user object (excluding password) to request
    const { password, ...safeUser } = user;
    req.user = safeUser;

    next();
  } catch (err) {
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server saat autentikasi." });
  }
};

/**
 * Express middleware to restrict route access exclusively to users with 'admin' role
 */
export const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Akses terlarang. Halaman/fitur ini khusus untuk Administrator." });
  }
  next();
};

/**
 * Express middleware to verify if the requesting user has access to a specific feature
 * Checks system-level maintenance toggles, admin role, active subscriptions, and free tier permissions.
 */
export const requireFeature = (featureId) => async (req, res, next) => {
  try {
    // 1. Check system-wide kill switch first
    const config = await SystemConfig.findOne({ key: "app_features" }).lean();
    if (config?.features?.[featureId] && config.features[featureId].enabled === false) {
      return res.status(403).json({
        message: `Fitur ${config.features[featureId].name || featureId} sedang dinonaktifkan sementara oleh administrator sistem.`,
        reason: "system_disabled",
      });
    }

    // 2. Admin role has unrestricted access
    if (req.user?.role === "admin") {
      return next();
    }

    // 3. Check active subscription
    let allowedFeatures = [];
    if (req.user?._id) {
      const activeSub = await Subscription.findOne({
        userId: req.user._id,
        status: "active",
      }).lean();

      if (activeSub && new Date(activeSub.expiredAt) > new Date()) {
        const plan = await PackagePlan.findOne({ planId: activeSub.subscriptionId }).lean();
        if (plan && Array.isArray(plan.features)) {
          allowedFeatures = plan.features;
        }
      }
    }

    // 4. If no active paid subscription, check free_user tier
    if (allowedFeatures.length === 0) {
      const freePlan = await PackagePlan.findOne({ planId: "free_user" }).lean();
      allowedFeatures = freePlan?.features || [];
    }

    if (allowedFeatures.includes(featureId)) {
      return next();
    }

    return res.status(403).json({
      message: "Fitur ini memerlukan paket langganan aktif. Silakan tingkatkan paket Anda.",
      reason: "subscription_required",
    });
  } catch (err) {
    console.error(`[requireFeature:${featureId}] Error:`, err.message);
    next();
  }
};
