import os from "os";
import fs from "fs";
import { execSync } from "child_process";
import mongoose from "mongoose";
import User from "../../db/models/User.js";
import Subscription from "../../db/models/Subscription.js";
import BillingTransaction from "../../db/models/BillingTransaction.js";
import SystemConfig from "../../db/models/SystemConfig.js";
import PackagePlan from "../../db/models/PackagePlan.js";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";
import Infografis from "../../db/models/Infografis.js";
import { logActivity } from "../user/activityController.js";
import { getLLMTokenStats } from "../../services/tokenTracker.js";

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
    config = new SystemConfig({
      key: "app_features",
      features: {
        analisis: {
          id: "analisis",
          name: "Workspace Analisis",
          tab: "workspace",
          description: "Kontrol akses halaman dan tombol tab Analisis & Histori Laporan BRS bagi role user",
          enabled: true,
        },
        bot: {
          id: "bot",
          name: "Bot WhatsApp",
          tab: "bot",
          description: "Kontrol akses halaman dan tombol tab Sambungkan Akun & Bot Knowledge bagi role user",
          enabled: true,
        },
        infografis: {
          id: "infografis",
          name: "Infografis",
          tab: "infografis",
          description: "Kontrol akses halaman dan tombol tab Buat Infografis & Histori Grafis bagi role user",
          enabled: true,
        },
      },
    });
    await config.save();
  } else {
    // Migrate or guarantee strictly the 3 tabbed features
    const required = {
      analisis: {
        id: "analisis",
        name: "Workspace Analisis",
        tab: "workspace",
        description: "Kontrol akses halaman dan tombol tab Analisis & Histori Laporan BRS bagi role user",
        enabled: config.features?.analisis?.enabled ?? true,
      },
      bot: {
        id: "bot",
        name: "Bot WhatsApp",
        tab: "bot",
        description: "Kontrol akses halaman dan tombol tab Sambungkan Akun & Bot Knowledge bagi role user",
        enabled: config.features?.bot?.enabled ?? (config.features?.whatsappBot?.enabled ?? true),
      },
      infografis: {
        id: "infografis",
        name: "Infografis",
        tab: "infografis",
        description: "Kontrol akses halaman dan tombol tab Buat Infografis & Histori Grafis bagi role user",
        enabled: config.features?.infografis?.enabled ?? true,
      },
    };

    config.features = required;
    config.markModified("features");
    await config.save();
  }
  return config;
};

/**
 * Helper to find a user by _id or userId (UUID string)
 */
const findUserByIdOrUUID = async (idOrUUID) => {
  if (!idOrUUID) return null;
  if (mongoose.isValidObjectId(idOrUUID)) {
    const user = await User.findById(idOrUUID);
    if (user) return user;
  }
  return await User.findOne({ userId: idOrUUID });
};

// Background CPU measurement to provide accurate real-time delta sampling matching Activity Monitor
let lastCpuSnapshot = null;
let currentCpuPercent = 0;

function takeCpuSnapshot() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total, time: Date.now() };
}

// Initial snapshot
lastCpuSnapshot = takeCpuSnapshot();

// Periodically measure CPU delta every 2 seconds (matching Activity Monitor sample rate)
setInterval(() => {
  try {
    const current = takeCpuSnapshot();
    if (lastCpuSnapshot) {
      const deltaIdle = current.idle - lastCpuSnapshot.idle;
      const deltaTotal = current.total - lastCpuSnapshot.total;
      if (deltaTotal > 0) {
        const percent = ((deltaTotal - deltaIdle) / deltaTotal) * 100;
        currentCpuPercent = Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
      }
    }
    lastCpuSnapshot = current;
  } catch (err) {}
}, 2000).unref();

/**
 * Helper: Calculate CPU usage percentage across cores (Real-time delta matching Activity Monitor)
 */
function getCpuUsage() {
  const cpus = os.cpus() || [];
  const loadAvg = (os.loadavg() || []).map((v) => Math.round(v * 100) / 100);

  let usagePercent = currentCpuPercent;
  if (!usagePercent && loadAvg.length > 0 && cpus.length > 0) {
    usagePercent = Math.min(100, Math.max(0, Math.round((loadAvg[0] / cpus.length) * 100 * 10) / 10));
  }

  return {
    usagePercent,
    cores: cpus.length,
    model: cpus[0]?.model || "Multi-Core CPU",
    loadAvg,
  };
}

/**
 * Helper: Calculate Memory (RAM) usage (Aligned with macOS Activity Monitor and Linux MemAvailable)
 */
function getMemoryUsage() {
  const totalBytes = os.totalmem();

  // macOS (Darwin): Use Mach VM statistics matching Activity Monitor (App + Wired + Compressed)
  if (os.platform() === "darwin") {
    try {
      const out = execSync("vm_stat", { timeout: 1000 }).toString();
      const pageSizeMatch = out.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;

      const getVal = (key) => {
        const m = out.match(new RegExp(key + ":\\s+(\\d+)"));
        return m ? parseInt(m[1], 10) : 0;
      };

      const wired = getVal("Pages wired down");
      const purgeable = getVal("Pages purgeable");
      const anonymous = getVal("Anonymous pages");
      const compressor = getVal("Pages occupied by compressor");

      // macOS Activity Monitor standard formula:
      // Memory Used = (Anonymous - Purgeable) + Wired + Compressed
      const appMem = Math.max(0, anonymous - purgeable) * pageSize;
      const wiredMem = wired * pageSize;
      const compressedMem = compressor * pageSize;
      const usedBytes = Math.min(totalBytes, appMem + wiredMem + compressedMem);
      const freeBytes = Math.max(0, totalBytes - usedBytes);
      const usagePercent = Math.round(((usedBytes / totalBytes) * 100) * 10) / 10;

      return {
        totalBytes,
        usedBytes,
        freeBytes,
        totalFormatted: (totalBytes / (1024 ** 3)).toFixed(1) + " GB",
        usedFormatted: (usedBytes / (1024 ** 3)).toFixed(1) + " GB",
        freeFormatted: (freeBytes / (1024 ** 3)).toFixed(1) + " GB",
        usagePercent,
      };
    } catch (err) {
      console.warn("[getMemoryUsage macOS] Error:", err.message);
    }
  }

  // Linux: Use MemAvailable from /proc/meminfo which accounts for buffers and cache
  if (os.platform() === "linux") {
    try {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
      const availMatch = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (availMatch) {
        const availBytes = parseInt(availMatch[1], 10) * 1024;
        const usedBytes = Math.max(0, totalBytes - availBytes);
        const usagePercent = Math.round(((usedBytes / totalBytes) * 100) * 10) / 10;
        return {
          totalBytes,
          usedBytes,
          freeBytes: availBytes,
          totalFormatted: (totalBytes / (1024 ** 3)).toFixed(1) + " GB",
          usedFormatted: (usedBytes / (1024 ** 3)).toFixed(1) + " GB",
          freeFormatted: (availBytes / (1024 ** 3)).toFixed(1) + " GB",
          usagePercent,
        };
      }
    } catch (err) {}
  }

  // Fallback (Windows or if vm_stat fails)
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const usagePercent = Math.round(((usedBytes / totalBytes) * 100) * 10) / 10;
  return {
    totalBytes,
    usedBytes,
    freeBytes,
    totalFormatted: (totalBytes / (1024 ** 3)).toFixed(1) + " GB",
    usedFormatted: (usedBytes / (1024 ** 3)).toFixed(1) + " GB",
    freeFormatted: (freeBytes / (1024 ** 3)).toFixed(1) + " GB",
    usagePercent,
  };
}

/**
 * Helper: Calculate Storage / Disk usage
 */
function getStorageUsage() {
  try {
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(process.cwd());
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail ? stats.bavail * stats.bsize : stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const usagePercent = Math.round(((usedBytes / totalBytes) * 100) * 10) / 10;
      return {
        totalBytes,
        usedBytes,
        freeBytes,
        totalFormatted: (totalBytes / (1024 ** 3)).toFixed(1) + " GB",
        usedFormatted: (usedBytes / (1024 ** 3)).toFixed(1) + " GB",
        freeFormatted: (freeBytes / (1024 ** 3)).toFixed(1) + " GB",
        usagePercent,
      };
    }
  } catch (err) {
    console.warn("[getStorageUsage] Error:", err.message);
  }
  return {
    totalBytes: 250 * 1024 ** 3,
    usedBytes: 50 * 1024 ** 3,
    freeBytes: 200 * 1024 ** 3,
    totalFormatted: "250.0 GB",
    usedFormatted: "50.0 GB",
    freeFormatted: "200.0 GB",
    usagePercent: 20,
  };
}

/**
 * Helper: Format system uptime into human-readable text
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} hari ${h} jam ${m} mnt`;
  if (h > 0) return `${h} jam ${m} mnt`;
  return `${m} mnt`;
}

/**
 * Helper: Aggregate current server utility payload
 */
const getServerUsagePayload = () => ({
  cpu: getCpuUsage(),
  memory: getMemoryUsage(),
  storage: getStorageUsage(),
  uptime: {
    seconds: Math.floor(os.uptime()),
    formatted: formatUptime(os.uptime()),
  },
  platform: os.platform() === "darwin" ? `macOS (${os.arch()})` : os.platform() === "win32" ? "Windows" : `Linux (${os.arch()})`,
  nodeVersion: process.version,
  timestamp: Date.now(),
});

/**
 * GET /api/admin/server-usage
 * Lightweight real-time server utility metrics (0 database queries)
 */
export const getServerUsageMetrics = async (req, res) => {
  try {
    const serverUsage = getServerUsagePayload();
    return res.json({ success: true, serverUsage });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/admin/server-usage/stream
 * Server-Sent Events (SSE) stream for real-time live monitoring
 */
export const streamServerUsageMetrics = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendUpdate = () => {
    try {
      const serverUsage = getServerUsagePayload();
      res.write(`data: ${JSON.stringify(serverUsage)}\n\n`);
    } catch (e) {}
  };

  sendUpdate();
  const timer = setInterval(sendUpdate, 2000);

  req.on("close", () => {
    clearInterval(timer);
  });
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
    const paidTransactions = await BillingTransaction.find({
      status: { $in: ["paid", "settlement", "success"] },
    });
    const totalRevenue = paidTransactions.reduce(
      (acc, curr) => acc + (curr.amount || curr.finalAmount || 0),
      0
    );

    // Recent transactions with user populated
    const recentTransactions = await BillingTransaction.find()
      .populate("userId", "email profile location")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Features active count
    const featObj = config.features || {};
    const totalFeatures = Object.keys(featObj).length;
    const activeFeatures = Object.values(featObj).filter((f) => f?.enabled).length;

    // Dataset & Analysis counters
    const totalAnalyses = await AnalysisHistory.countDocuments();
    const totalInfografis = await Infografis.countDocuments();

    // Calculate 6-month revenue trend
    const monthNamesIndo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const now = new Date();
    const revenueTrend = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const label = `${monthNamesIndo[month]} ${year}`;
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

      revenueTrend.push({
        monthKey,
        label,
        revenue: 0,
        count: 0,
        transactionsCount: 0,
      });
    }

    paidTransactions.forEach((tx) => {
      const txDate = tx.paidAt || tx.createdAt;
      if (!txDate) return;
      const d = new Date(txDate);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;

      const bucket = revenueTrend.find((b) => b.monthKey === key);
      const amt = tx.amount || tx.finalAmount || 0;
      if (bucket) {
        bucket.revenue += amt;
        bucket.count += 1;
        bucket.transactionsCount += 1;
      }
    });

    // Server Usage Metrics (CPU, Memory, Storage)
    const serverUsage = getServerUsagePayload();

    // LLM Token Usage metrics per model
    const llmUsage = await getLLMTokenStats();

    const statsData = {
      totalUsers,
      adminUsers,
      regularUsers,
      activeSubscribers: activeSubscriptions,
      activeSubscriptions,
      pendingSubscriptions,
      totalRevenue,
      revenueTrend,
      serverUsage,
      llmUsage,
      totalAnalyses,
      totalInfografis,
      recentTransactions,
      features: {
        total: totalFeatures,
        active: activeFeatures,
      },
    };

    return res.json({
      success: true,
      stats: statsData,
      data: statsData,
    });
  } catch (err) {
    console.error("[getAdminStats] Error:", err.message);
    return res.status(500).json({ message: "Gagal memuat statistik admin: " + err.message });
  }
};

/**
 * GET /api/admin/llm-usage
 * Standalone endpoint to get LLM token usage
 */
export const getLLMUsageStats = async (req, res) => {
  try {
    const stats = await getLLMTokenStats();
    return res.json({ success: true, data: stats, stats });
  } catch (err) {
    return res.status(500).json({ message: "Gagal memuat token usage LLM: " + err.message });
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

    // Enrich users with active subscription details matching User._id
    const validObjectIds = users
      .map((u) => u._id)
      .filter((id) => mongoose.isValidObjectId(id));

    const subscriptions = await Subscription.find({
      userId: { $in: validObjectIds },
      status: "active",
    }).lean();

    const subMap = {};
    for (const sub of subscriptions) {
      if (sub.userId) {
        subMap[sub.userId.toString()] = sub;
      }
    }

    const enrichedUsers = users.map((u) => {
      const sub = u._id ? subMap[u._id.toString()] : null;
      return {
        ...u,
        role: u.role || "user",
        subscription: sub
          ? {
              plan: sub.subscriptionId,
              status: sub.status,
              quota: {
                word: sub.quota,
                pdf: sub.quota,
              },
              startedAt: sub.startedAt,
              expiredAt: sub.expiredAt,
            }
          : null,
      };
    });

    const responsePayload = {
      users: enrichedUsers,
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
    };

    return res.json({
      success: true,
      users: enrichedUsers,
      data: responsePayload,
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

    const user = await findUserByIdOrUUID(userId);
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    // Safety check: Prevent admin from demoting themselves if they are the only admin
    const callerId = req.user?._id?.toString();
    const targetId = user._id?.toString();
    if (callerId === targetId && role === "user") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Tidak dapat mengubah role akun sendiri karena Anda adalah satu-satunya admin.",
        });
      }
    }

    const oldRole = user.role || "user";
    user.role = role;
    await user.save();

    await logActivity(
      req.user._id,
      `Mengubah role pengguna ${user.email} dari ${oldRole} menjadi ${role}`
    );

    return res.json({
      success: true,
      message: `Role pengguna ${user.email} berhasil diperbarui menjadi ${role}.`,
      user: {
        _id: user._id,
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
    const { status, quota, durationDays, planId, plan } = req.body;

    const user = await findUserByIdOrUUID(userId);
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    const finalPlanId = planId || plan || "wa_analisis_yearly";
    const quotaVal =
      typeof quota === "object"
        ? (quota.word ?? quota.pdf ?? 30)
        : (parseInt(quota, 10) || 30);

    let sub = await Subscription.findOne({
      userId: user._id,
      status: "active",
    });

    if (!sub) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + (parseInt(durationDays, 10) || 365));
      sub = new Subscription({
        userId: user._id,
        subscriptionId: finalPlanId,
        status: status || "active",
        startedAt: new Date(),
        expiredAt: expDate,
        quota: quotaVal,
      });
    } else {
      if (status) sub.status = status;
      if (quotaVal !== undefined) sub.quota = quotaVal;
      if (durationDays) {
        const expDate = new Date(sub.startedAt || new Date());
        expDate.setDate(expDate.getDate() + parseInt(durationDays, 10));
        sub.expiredAt = expDate;
      }
      if (finalPlanId) sub.subscriptionId = finalPlanId;
    }

    await sub.save();
    await logActivity(
      req.user._id,
      `Mengatur langganan pengguna ${user.email}: Paket ${sub.subscriptionId}, Status ${sub.status}, Kuota ${sub.quota}`
    );

    return res.json({
      success: true,
      message: `Langganan untuk ${user.email} berhasil diperbarui.`,
      subscription: sub,
      data: sub,
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

    const user = await findUserByIdOrUUID(userId);
    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    const callerId = req.user?._id?.toString();
    const targetId = user._id?.toString();
    if (callerId === targetId) {
      return res.status(400).json({ message: "Tidak dapat menghapus akun Anda sendiri." });
    }

    const email = user.email;
    await User.deleteOne({ _id: user._id });
    await Subscription.deleteMany({ userId: user._id });
    await BillingTransaction.deleteMany({ userId: user._id });

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
      price: pkg.amount,
      activeSubscribers: countMap[pkg.planId] || 0,
    }));

    return res.json({
      success: true,
      packages: enriched,
      data: enriched,
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
    const { name, amount, price, quota, durationDays, isActive, badge, features } = req.body;

    let pkg = await PackagePlan.findOne({ planId });
    if (!pkg) {
      return res.status(404).json({ message: "Paket langganan tidak ditemukan." });
    }

    if (name) pkg.name = name;
    const finalAmount = amount !== undefined ? amount : price;
    if (finalAmount !== undefined) pkg.amount = Number(finalAmount);
    if (quota !== undefined) {
      pkg.quota = typeof quota === "object" ? (quota.word ?? 30) : Number(quota);
    }
    if (durationDays !== undefined) pkg.durationDays = Number(durationDays);
    if (isActive !== undefined) pkg.isActive = Boolean(isActive);
    if (badge !== undefined) pkg.badge = badge;
    if (Array.isArray(features)) pkg.features = features;

    await pkg.save();
    await logActivity(
      req.user._id,
      `Mengubah konfigurasi paket ${pkg.name}: Rp${pkg.amount}, kuota ${pkg.quota}`
    );

    const result = {
      ...pkg.toObject(),
      price: pkg.amount,
    };

    return res.json({
      success: true,
      message: `Paket ${pkg.name} berhasil diperbarui.`,
      package: result,
      data: result,
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
    const featObj = config.features || {};

    const featureList = Object.entries(featObj).map(([key, val]) => ({
      featureId: key,
      name: val.name,
      description: val.description,
      enabled: val.enabled,
    }));

    return res.json({
      success: true,
      features: featureList,
      data: featureList,
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

    const newStatus =
      enabled !== undefined ? Boolean(enabled) : !config.features[featureId].enabled;
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
      data: config.features[featureId],
    });
  } catch (err) {
    console.error("[toggleFeature] Error:", err.message);
    return res.status(500).json({ message: "Gagal mengubah status fitur: " + err.message });
  }
};

/**
 * POST /api/admin/packages
 * Create a new package plan
 */
export const createPackage = async (req, res) => {
  try {
    const { planId, name, amount, price, quota, durationDays, isActive, badge, features } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Nama paket wajib diisi." });
    }

    const finalPlanId =
      planId?.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") + `_${Date.now()}`;

    const existing = await PackagePlan.findOne({ planId: finalPlanId });
    if (existing) {
      return res.status(400).json({ message: `ID Paket "${finalPlanId}" sudah digunakan.` });
    }

    const finalAmount = amount !== undefined ? Number(amount) : (price !== undefined ? Number(price) : 0);

    const newPkg = new PackagePlan({
      planId: finalPlanId,
      name: name.trim(),
      category: "Paket Kustom",
      amount: finalAmount,
      quota: quota !== undefined ? Number(quota) : 30,
      durationDays: durationDays !== undefined ? Number(durationDays) : 30,
      isActive: isActive !== false,
      badge: badge || "",
      features: Array.isArray(features) ? features : [],
    });

    await newPkg.save();
    await logActivity(req.user._id, `Membuat paket langganan baru: ${newPkg.name}`);

    const result = {
      ...newPkg.toObject(),
      price: newPkg.amount,
      activeSubscribers: 0,
    };

    return res.status(201).json({
      success: true,
      message: `Paket "${newPkg.name}" berhasil dibuat.`,
      package: result,
      data: result,
    });
  } catch (err) {
    console.error("[createPackage] Error:", err.message);
    return res.status(500).json({ message: "Gagal membuat paket baru: " + err.message });
  }
};

/**
 * DELETE /api/admin/packages/:planId
 * Delete a package plan
 */
export const deletePackage = async (req, res) => {
  try {
    const { planId } = req.params;

    const deleted = await PackagePlan.findOneAndDelete({ planId });
    if (!deleted) {
      return res.status(404).json({ message: "Paket langganan tidak ditemukan." });
    }

    await logActivity(req.user._id, `Menghapus paket langganan: ${deleted.name} (${deleted.planId})`);

    return res.json({
      success: true,
      message: `Paket "${deleted.name}" berhasil dihapus.`,
      deletedPlanId: planId,
    });
  } catch (err) {
    console.error("[deletePackage] Error:", err.message);
    return res.status(500).json({ message: "Gagal menghapus paket: " + err.message });
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
        analisis: true,
        bot: true,
        infografis: true,
      },
    });
  }
};
