import express from "express";
import fs from "fs";
import { authMiddleware } from "../../controller/user/authMiddleware.js";
import {
  registerUser,
  loginUser,
  updateUserProfile,
  updateUserPassword,
} from "../../controller/user/userController.js";
import {
  logActivity,
  getUserActivities,
} from "../../controller/user/activityController.js";
import {
  addAnalysisHistory,
  getUserAnalysisHistory,
  getAnalysisFilePath,
} from "../../controller/user/analysisController.js";
import {
  createOrUpdateSubscription,
  getSubscriptionStatus,
} from "../../controller/user/subscriptionController.js";
import {
  initiatePayment,
  verifyPayment,
  getBillingHistory,
} from "../../controller/user/billingController.js";

const router = express.Router();

// Helper to catch async errors
const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    res.status(400).json({ message: err.message || "Bad request" });
  });
};

// ================= AUTHENTICATION =================
router.post(
  "/register",
  asyncRoute(async (req, res) => {
    const { email, password, name, kota } = req.body;
    const user = await registerUser(email, password, name, kota);
    res.status(201).json({ message: "Registrasi berhasil", user });
  }),
);

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json({ message: "Login berhasil", ...result });
  }),
);

// ================= USER PROFILE & LOCATION =================
router.get(
  "/profile",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json({ user: req.user });
  }),
);

router.post(
  "/profile",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { name, avatar, instansiType, picName, picPhone } = req.body;
    const user = await updateUserProfile(req.user._id, {
      name,
      avatar,
      instansiType,
      picName,
      picPhone,
    });
    await logActivity(req.user._id, "Mengubah data profil");
    res.json({ message: "Profil diperbarui", user });
  }),
);

router.post(
  "/profile/password",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    await updateUserPassword(req.user._id, oldPassword, newPassword);
    await logActivity(req.user._id, "Mengubah kata sandi akun");
    res.json({ message: "Kata sandi berhasil diperbarui" });
  }),
);

// ================= USER ACTIVITIES =================
router.get(
  "/activities",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const activities = await getUserActivities(req.user._id);
    res.json(activities);
  }),
);

router.post(
  "/activity",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { activityName } = req.body;
    const activity = await logActivity(req.user._id, activityName);
    res.status(201).json(activity);
  }),
);

// ================= ANALYSIS HISTORY =================
router.get(
  "/analysis",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const history = await getUserAnalysisHistory(req.user._id);
    res.json(history);
  }),
);

router.post(
  "/analysis",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { title, periode, fileContent, fileName } = req.body;

    if (!fileContent) {
      return res
        .status(400)
        .json({ message: "fileContent (base64) wajib disertakan" });
    }

    // Convert base64 back to binary buffer
    const fileBuffer = Buffer.from(fileContent, "base64");
    const history = await addAnalysisHistory(
      req.user._id,
      title,
      periode,
      fileBuffer,
      fileName || "report.idml",
    );

    await logActivity(
      req.user._id,
      `Membuat riwayat analisis: ${title} (${periode})`,
    );
    res
      .status(201)
      .json({ message: "Riwayat analisis berhasil disimpan", history });
  }),
);

router.get(
  "/analysis/:id/download",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { filePath, filename } = await getAnalysisFilePath(req.user._id, id);

    await logActivity(
      req.user._id,
      `Mengunduh file analisis IDML untuk riwayat ID: ${id}`,
    );
    res.download(filePath, filename);
  }),
);

router.get(
  "/analysis/:id/download/pdf",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { filePath, filename } = await getAnalysisFilePath(req.user._id, id);
    const pdfFilePath = filePath.replace(/\.idml$/, ".pdf");
    const pdfFilename = filename.replace(/\.idml$/, ".pdf");

    if (!fs.existsSync(pdfFilePath)) {
      return res
        .status(404)
        .json({ message: "File PDF tidak ditemukan di server" });
    }

    await logActivity(
      req.user._id,
      `Mengunduh file analisis`,
    );
    res.download(pdfFilePath, pdfFilename);
  }),
);

// ================= SUBSCRIPTION =================
router.get(
  "/subscription",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const sub = await getSubscriptionStatus(req.user._id);
    res.json(sub);
  }),
);

router.post(
  "/subscription",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { planId, quota, durationDays } = req.body;
    const sub = await createOrUpdateSubscription(
      req.user._id,
      planId,
      quota,
      durationDays,
    );
    await logActivity(req.user._id, `Berlangganan paket: ${planId}`);
    res.status(201).json({
      message: "Langganan berhasil diaktifkan/diperbarui",
      subscription: sub,
    });
  }),
);

// ================= BILLING TRANSACTIONS =================
router.get(
  "/billing",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const history = await getBillingHistory(req.user._id);
    res.json(history);
  }),
);

router.post(
  "/billing/pay",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { planId } = req.body;
    const result = await initiatePayment(req.user._id, planId);
    res.status(201).json(result);
  }),
);

router.get(
  "/billing/check/:invoiceId",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { invoiceId } = req.params;
    const result = await verifyPayment(req.user._id, invoiceId);
    res.json(result);
  }),
);

export default router;
