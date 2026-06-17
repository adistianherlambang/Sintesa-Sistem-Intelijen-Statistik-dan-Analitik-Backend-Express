import express from "express";
import Infografis from "../../db/models/Infografis.js";
import { authMiddleware } from "../../controller/user/authMiddleware.js";

const router = express.Router();

const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    res.status(400).json({ message: err.message || "Bad request" });
  });
};

// 1. GET ALL INFOGRAFIS FOR USER
router.get(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const items = await Infografis.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();
    
    const formatted = items.map((item) => ({
      ...item,
      id: item._id, // frontend expects project.id
    }));
    
    res.json(formatted);
  })
);

// 2. GET SINGLE INFOGRAFIS BY ID
router.get(
  "/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const item = await Infografis.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!item) {
      return res.status(404).json({ message: "Infografis tidak ditemukan" });
    }

    res.json({
      ...item,
      id: item._id,
    });
  })
);

// 3. CREATE NEW INFOGRAFIS
router.post(
  "/",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { pages, preview, canvasSize } = req.body;

    const newInfografis = new Infografis({
      userId: req.user._id,
      pages,
      preview,
      canvasSize,
    });

    await newInfografis.save();

    res.status(201).json({
      message: "Infografis berhasil dibuat",
      infografis: {
        ...newInfografis.toObject(),
        id: newInfografis._id,
      },
    });
  })
);

// 4. UPDATE EXISTING INFOGRAFIS BY ID
router.put(
  "/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { pages, preview, canvasSize } = req.body;

    const updated = await Infografis.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { pages, preview, canvasSize },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "Infografis tidak ditemukan atau akses ditolak" });
    }

    res.json({
      message: "Infografis berhasil diperbarui",
      infografis: {
        ...updated,
        id: updated._id,
      },
    });
  })
);

// 5. DELETE INFOGRAFIS BY ID
router.delete(
  "/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const deleted = await Infografis.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Infografis tidak ditemukan atau akses ditolak" });
    }

    res.json({ message: "Infografis berhasil dihapus" });
  })
);

export default router;
