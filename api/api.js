import e from "express";

//middleware
import overview from "./dashboard/overview.js";
import userRoutes from "./users/userRoutes.js";

const router = e.Router();

router.use("/dashboard/overview", overview);
router.use("/users", userRoutes);

export default router;
