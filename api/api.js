import e from "express";
import User from "../db/models/User.js";

//middleware
import overview from "./dashboard/overview.js";
import userRoutes from "./users/userRoutes.js";
import botRoutes from "./users/botRoutes.js";
import infografisRoutes from "./users/infografisRoutes.js";
import llmRoutes from "./llm/llmRoutes.js";
import analisisRoutes from "./analisis/analisisRoutes.js";
import adminRoutes from "./admin/adminRoutes.js";
import { getPublicFeatures } from "../controller/admin/adminController.js";

import kota from "../json/kota.json" with { type: "json" };

const router = e.Router();

router.use("/dashboard/overview", overview);
router.use("/analisis", analisisRoutes);
router.use("/users", userRoutes);
router.use("/users/bot", botRoutes);
router.use("/users/infografis", infografisRoutes);
router.use("/llm", llmRoutes);
router.use("/admin", adminRoutes);
router.get("/features/public", getPublicFeatures);

router.get("/kota", async (req, res) => {
  try {
    const users = await User.find({ location: { $ne: null } }, "location.id");
    const claimedIds = new Set(
      users.map((u) => u.location?.id).filter(Boolean),
    );
    const kotaWithClaims = kota.map((c) => ({
      ...c,
      claimed: claimedIds.has(c.id),
    }));
    res.json(kotaWithClaims);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

export default router;
