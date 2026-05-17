import e from "express";

//middleware
import overview from "./dashboard/overview.js";

const router = e.Router();

router.use("/dashboard/overview", overview);

export default router;
