import e from "express";
import dotenv from "dotenv";

// Controllers
import { getInflasiByKota, getAllInflasi } from "../../controller/dashboard/inflasiController.js";
import { getIhkByKota, getAllIhk } from "../../controller/dashboard/ihkController.js";
import { getKomoditasByKota, getAllKomoditas } from "../../controller/dashboard/komoditasController.js";
import { testBPSAPI, getAllDashboard } from "../../controller/dashboard/dashboardController.js";

dotenv.config();

const router = e.Router();

// ============= INFLASI ROUTES =============
router.post("/inflasi", getInflasiByKota);
router.get("/inflasi", getAllInflasi);

// ============= IHK ROUTES =============
router.post("/ihk", getIhkByKota);
router.get("/ihk", getAllIhk);

// ============= KOMODITAS ROUTES =============
router.get("/komoditas", getAllKomoditas);
router.post("/komoditas", getKomoditasByKota);

// ============= TEST & GENERAL ROUTES =============
router.post("/testapi", testBPSAPI);
router.get("/", getAllDashboard);

export default router;
