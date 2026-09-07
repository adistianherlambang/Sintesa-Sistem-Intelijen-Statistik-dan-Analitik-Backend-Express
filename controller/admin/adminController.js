import User from "../../db/models/User.js";
import Subscription from "../../db/models/Subscription.js";
import BillingTransaction from "../../db/models/BillingTransaction.js";
import SystemConfig from "../../db/models/SystemConfig.js";
import PackagePlan from "../../db/models/PackagePlan.js";
import { logActivity } from "../user/activityController.js";

// Default plans seed
const DEFAULT_PLANS = [
  {
    planId: "wa_only_monthly",
    name: "Bot WhatsApp Only (Bulanan)",
    category: "WhatsApp Bot",
    amount: 50000,
    quota: 30,
    durationDays: 30,
    features: ["Auto-response Data Statistik", "Integrasi Nomor WhatsApp Resmi", "30 Kuota Interaksi / Hari"],
    badge: "Populer",
    isActive: true,
  },
  {
    planId: "wa_only_yearly",
    name: "Bot WhatsApp Only (Tahunan)",
    category: "WhatsApp Bot",
    amount: 500000,
    quota: 365,
    durationDays: 365,
    features: ["Auto-response Data Statistik", "Integrasi Nomor WhatsApp Resmi", "365 Kuota Interaksi / Hari", "Hemat 17%"],
    badge: "Hemat",
    isActive: true,
  },
  {
    planId: "wa_analisis_monthly",
    name: "Bot WhatsApp + Analisis (Bulanan)",
    category: "Full Intelligence Suite",
    amount: 60000,
    quota: 10,
    durationDays: 30,
    features: ["Fitur Bot WhatsApp Lengkap", "Generator Berita Resmi Statistik (BRS)", "AI Forecasting & Proyeksi Inflasi", "10 Kuota Ekspor BRS"],
    badge: "Rekomendasi",
    isActive: true,
  },
  {
    planId: "wa_analisis_yearly",
    name: "Bot WhatsApp + Analisis (Tahunan)",
    category: "Full Intelligence Suite",
    amount: 600000,
    quota: 10,
    durationDays: 365,
    features: ["Fitur Bot WhatsApp Lengkap", "Generator Berita Resmi Statistik (BRS)", "AI Forecasting & Proyeksi Inflasi", "Prioritas Dukungan Teknis", "Hemat 17%"],
    badge: "Terbaik",
    isActive: true,
  },
];

/**
 * Seed initial package plans if none exist
 */
const ensurePackagePlansSeeded = async () => {
  const count = await PackagePlan.countDocuments();
  if (count === 0) {
    await PackagePlan.insertMany(DEFAULT_PLANS);
  }
};

/**
 * Seed initial SystemConfig if none exist
 */
const getOrCreateSystemConfig = async () => {
  let config = await SystemConfig.findOne({ key: "app_features" });
  if (!config) {
    config = new SystemConfig({ key: "app_features" });
    await config.save();
  }
  return config;
};

/**
 * GET /api/admin/stats
 * Dashboard metrics for Administrator
 */
export const getAdminStats = async (req, res) => {
  try {
    await ensurePackagePlansSeeded();
    const config = await getOrCreateSystemConfig();

    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: "admin" });
    const regularUsers = totalUsers - adminUsers;

    const activeSubscriptions = await Subscription.countDocuments({ status: "active" });
    const pendingSubscriptions = await Subscription.countDocuments({ status: "pending" });

    // Calculate total paid revenue
    const paidTransactions = await BillingTransaction.find({ status: "paid" });
    const totalRevenue = paidTransactions.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    // Recent 5 transactions
    const recentTransactions = await BillingTransaction.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Features active count
    const featObj = config.features || {};
    const totalFeatures = Object.keys(featObj).length;
    const activeFeatures = Object.values(featObj).filter((f) => f?.enabled).length;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        adminUsers,
        regularUsers,
        activeSubscriptions,
        pendingSubscriptions,
        totalRevenue,
        recentTransactions,
        features: {
          total: totalFeatures,
          active: activeFeatures,
        },
      },
    });
  } catch (err) {
    console.error("[getAdminStats] Error:", err.message);
    return res.status(500).json({ message: "Gagal memuat statistik admin: " + err.message });
  }
};

/**
 * GET /api/admin/users
 * Manage User: List all users with pagination, search, and role filter
 */
export const getUsersList = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", role = "" } = req.query;
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.max(1, parseInt(limit, 10));

    const query = {};
    if (role && ["admin", "user"].includes(role)) {
      query.role = role;
    }
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { email: searchRegex },
        { "profile.name": searchRegex },
        { "profile.picName": searchRegex },
        { "location.name": searchRegex },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean();

    // Enrich users with active subscription details
    const userIds = users.map((u) => u.userId);
    const subscriptions = await Subscription.find({
      userId: { $in: userIds },
      status: "active",
    }).lean();

    const subMap = {};
    for (const sub of subscriptions) {
      subMap[sub.userId] = sub;
    }

    const enrichedUsers = users.map((u) => ({
      ...u,
      role: u.role || "user",
      subscription: subMap[u.userId] || null,
    }));

    return res.json({
      success: true,
      users: enrichedUsers,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    });
  } catch (err) {
    console.error("[getUsersList] Error:", err.message);
    return res.status(500).json({ message: "Gagal memuat daftar user: " + err.message });
  }
};

/**
 * PUT /api/admin/users/:userId/role
 * Change user role (user <-> admin)
 */
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "Role tidak valid. Harus 'user' atau 'admin'." });
    }

    // Safety check: Prevent admin from demoting themselves if they are the only admin
    if (req.user?.userId === userId && role === "user") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "Tidak dapat mengubah role akun sendiri karena Anda adalah satu-satunya admin." });
      }
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    const oldRole = user.role || "user";
    user.role = role;
    await user.save();

    await logActivity(req.user._id, `Mengubah role pengguna ${user.email} dari ${oldRole} menjadi ${role}`);

    return res.json({
      success: true,
      message: `Role pengguna ${user.email} berhasil diperbarui menjadi ${role}.`,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[updateUserRole] Error:", err.message);
    return res.status(500).json({ message: "Gagal memperbarui role pengguna: " + err.message });
  }
};

/**
 * PUT /api/admin/users/:userId/subscription
 * Set or grant user subscription/quota directly by admin
 */
export const updateUserSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, quota, durationDays, planId } = req.body;

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    let sub = await Subscription.findOne({ userId, status: "active" });
    if (!sub) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + (parseInt(durationDays, 10) || 30));
      sub = new Subscription({
        userId,
        subscriptionId: planId || "admin_grant",
        status: status || "active",
        startedAt: new Date(),
        expiredAt: expDate,
        quota: parseInt(quota, 10) || 30,
      });
    } else {
      if (status) sub.status = status;
      if (quota !== undefined) sub.quota = parseInt(quota, 10);
      if (durationDays) {
        const expDate = new Date(sub.startedAt || new Date());
        expDate.setDate(expDate.getDate() + parseInt(durationDays, 10));
        sub.expiredAt = expDate;
      }
      if (planId) sub.subscriptionId = planId;
    }

    await sub.save();
    await logActivity(req.user._id, `Mengatur langganan pengguna ${user.email}: Status ${sub.status}, Kuota ${sub.quota}`);

    return res.json({
      success: true,
      message: `Langganan untuk ${user.email} berhasil diperbarui.`,
      subscription: sub,
    });
  } catch (err) {
    console.error("[updateUserSubscription] Error:", err.message);
    return res.status(500).json({ message: "Gagal memperbarui langganan: " + err.message });
  }
};

/**
 * DELETE /api/admin/users/:userId
 * Delete user account by admin
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user?.userId === userId) {
      return res.status(400).json({ message: "Tidak dapat menghapus akun Anda sendiri." });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    const email = user.email;
    await User.deleteOne({ userId });
    await Subscription.deleteMany({ userId });
    await BillingTransaction.deleteMany({ userId });

    await logActivity(req.user._id, `Menghapus akun pengguna: ${email}`);

    return res.json({
      success: true,
      message: `Pengguna ${email} berhasil dihapus dari sistem.`,
    });
  } catch (err) {
    console.error("[deleteUser] Error:", err.message);
    return res.status(500).json({ message: "Gagal menghapus pengguna: " + err.message });
  }
};

/**
 * GET /api/admin/packages
 * Monitor package plans & pricing
 */
export const getPackagesList = async (req, res) => {
  try {
    await ensurePackagePlansSeeded();
    const packages = await PackagePlan.find().sort({ amount: 1 }).lean();

    // Count active subscribers for each package plan
    const counts = await Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$subscriptionId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id] = c.count;
    });

    const enriched = packages.map((pkg) => ({
      ...pkg,
      activeSubscribers: countMap[pkg.planId] || 0,
    }));

    return res.json({
      success: true,
      packages: enriched,
    });
  } catch (err) {
    console.error("[getPackagesList] Error:", err.message);
    return res.status(500).json({ message: "Gagal memuat daftar paket: " + err.message });
  }
};

/**
 * PUT /api/admin/packages/:planId
 * Update package price, quota, or status
 */
export const updatePackage = async (req, res) => {
  try {
    const { planId } = req.params;
    const { name, amount, quota, durationDays, isActive, badge, features } = req.body;

    let pkg = await PackagePlan.findOne({ planId });
    if (!pkg) {
      return res.status(404).json({ message: "Paket langganan tidak ditemukan." });
    }

    if (name) pkg.name = name;
    if (amount !== undefined) pkg.amount = Number(amount);
    if (quota !== undefined) pkg.quota = Number(quota);
    if (durationDays !== undefined) pkg.durationDays = Number(durationDays);
    if (isActive !== undefined) pkg.isActive = Boolean(isActive);
    if (badge !== undefined) pkg.badge = badge;
    if (Array.isArray(features)) pkg.features = features;

    await pkg.save();
    await logActivity(req.user._id, `Mengubah konfigurasi paket ${pkg.name}: Rp${pkg.amount}, kuota ${pkg.quota}`);

    return res.json({
      success: true,
      message: `Paket ${pkg.name} berhasil diperbarui.`,
      package: pkg,
    });
  } catch (err) {
    console.error("[updatePackage] Error:", err.message);
    return res.status(500).json({ message: "Gagal memperbarui paket: " + err.message });
  }
};

/**
 * GET /api/admin/features
 * Get all feature flags
 */
export const getFeatures = async (req, res) => {
  try {
    const config = await getOrCreateSystemConfig();
    return res.json({
      success: true,
      features: config.features,
    });
  } catch (err) {
    console.error("[getFeatures] Error:", err.message);
    return res.status(500).json({ message: "Gagal memuat status fitur: " + err.message });
  }
};

/**
 * PUT /api/admin/features/:featureId/toggle
 * Toggle a feature flag ON / OFF
 */
export const toggleFeature = async (req, res) => {
  try {
    const { featureId } = req.params;
    const { enabled } = req.body;

    const config = await getOrCreateSystemConfig();

    if (!config.features || !config.features[featureId]) {
      return res.status(404).json({ message: `Fitur '${featureId}' tidak dikenali dalam sistem.` });
    }

    const newStatus = enabled !== undefined ? Boolean(enabled) : !config.features[featureId].enabled;
    config.features[featureId].enabled = newStatus;
    config.markModified("features");
    await config.save();

    const featName = config.features[featureId].name || featureId;
    await logActivity(
      req.user._id,
      `${newStatus ? "Mengaktifkan" : "Menonaktifkan"} fitur sistem: ${featName}`
    );

    return res.json({
      success: true,
      message: `Fitur '${featName}' sekarang ${newStatus ? "AKTIF" : "NONAKTIF"}.`,
      feature: config.features[featureId],
      features: config.features,
    });
  } catch (err) {
    console.error("[toggleFeature] Error:", err.message);
    return res.status(500).json({ message: "Gagal mengubah status fitur: " + err.message });
  }
};

/**
 * GET /api/features/public
 * Public endpoint to fetch active feature flags
 */
export const getPublicFeatures = async (req, res) => {
  try {
    const config = await getOrCreateSystemConfig();
    const publicMap = {};
    for (const [key, val] of Object.entries(config.features || {})) {
      publicMap[key] = Boolean(val?.enabled);
    }
    return res.json({
      success: true,
      features: publicMap,
    });
  } catch (err) {
    return res.json({
      success: true,
      features: {
        aiForecasting: true,
        whatsappBot: true,
        wordExport: true,
        infografis: true,
        userRegistration: true,
      },
    });
  }
};
