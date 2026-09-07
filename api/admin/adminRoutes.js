import express from "express";
import { authMiddleware, adminMiddleware } from "../../controller/user/authMiddleware.js";
import {
  getAdminStats,
  getUsersList,
  updateUserRole,
  updateUserSubscription,
  deleteUser,
  getPackagesList,
  updatePackage,
  getFeatures,
  toggleFeature,
} from "../../controller/admin/adminController.js";

const router = express.Router();

// All routes here require authentication + admin role
router.use(authMiddleware, adminMiddleware);

// 1. Dashboard metrics
router.get("/stats", getAdminStats);

// 2. Manage Users
router.get("/users", getUsersList);
router.put("/users/:userId/role", updateUserRole);
router.put("/users/:userId/subscription", updateUserSubscription);
router.delete("/users/:userId", deleteUser);

// 3. Monitor Paket & Harga
router.get("/packages", getPackagesList);
router.put("/packages/:planId", updatePackage);

// 4. Manajemen Fitur (Feature Flags)
router.get("/features", getFeatures);
router.put("/features/:featureId/toggle", toggleFeature);

export default router;
