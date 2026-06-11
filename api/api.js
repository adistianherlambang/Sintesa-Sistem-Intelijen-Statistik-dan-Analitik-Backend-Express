import e from "express";
import User from "../db/models/User.js";

//middleware
import overview from "./dashboard/overview.js";
import userRoutes from "./users/userRoutes.js";
import botRoutes from "./users/botRoutes.js";

import kota from "../json/kota.json" with { type: "json" };

const router = e.Router();

router.use("/dashboard/overview", overview);
router.use("/users", userRoutes);
router.use("/users/bot", botRoutes);

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
