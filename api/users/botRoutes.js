import express from "express";
import { authMiddleware } from "../../controller/user/authMiddleware.js";
import {
  initializeWhatsAppClient,
  destroyWhatsAppClient,
  getActiveClient,
  checkAndResetDailyStats,
} from "../../services/whatsappService.js";
import WhatsAppSession from "../../db/models/WhatsAppSession.js";
import BotKnowledge from "../../db/models/BotKnowledge.js";
import { logActivity } from "../../controller/user/activityController.js";

const router = express.Router();

// Helper to catch async errors
const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    res.status(400).json({ message: err.message || "Bad request" });
  });
};

// ================= WHATSAPP SESSION CONTROLS =================

// Get session details
router.get(
  "/session",
  authMiddleware,
  asyncRoute(async (req, res) => {
    let session = await WhatsAppSession.findOne({ userId: req.user._id });
    if (!session) {
      // Create a default session model for the user if it doesn't exist
      session = new WhatsAppSession({ userId: req.user._id });
      await session.save();
    } else {
      await checkAndResetDailyStats(session);
    }
    res.json(session);
  }),
);

// Connect session
router.post(
  "/session/connect",
  authMiddleware,
  asyncRoute(async (req, res) => {
    await initializeWhatsAppClient(req.user._id);
    await logActivity(req.user._id, "Membuka sesi koneksi WhatsApp");
    res.json({ message: "Menghubungkan klien WhatsApp..." });
  }),
);

// Disconnect session
router.post(
  "/session/disconnect",
  authMiddleware,
  asyncRoute(async (req, res) => {
    await destroyWhatsAppClient(req.user._id);
    await logActivity(req.user._id, "Memutus koneksi WhatsApp");
    res.json({ message: "Sesi WhatsApp terputus" });
  }),
);

// Restart session
router.post(
  "/session/restart",
  authMiddleware,
  asyncRoute(async (req, res) => {
    await destroyWhatsAppClient(req.user._id);
    // Wait briefly before starting again
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await initializeWhatsAppClient(req.user._id);
    await logActivity(req.user._id, "Memulai ulang sesi koneksi WhatsApp");
    res.json({ message: "Sesi WhatsApp berhasil dimuat ulang" });
  }),
);

// Update configuration
router.put(
  "/session/config",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { botEnabled, activeTimeStart, activeTimeEnd } = req.body;
    const session = await WhatsAppSession.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          botEnabled,
          activeTimeStart,
          activeTimeEnd,
        },
      },
      { returnDocument: "after", upsert: true },
    );
    await logActivity(
      req.user._id,
      "Mengubah konfigurasi jam aktif/status Bot WhatsApp",
    );
    res.json({ message: "Konfigurasi bot disimpan", session });
  }),
);

// ================= BOT KNOWLEDGE CRUD =================

// List knowledge entries
router.get(
  "/knowledge",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const list = await BotKnowledge.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(list);
  }),
);

// Add new knowledge entry
router.post(
  "/knowledge",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { title, category, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: "Judul dan Konten wajib diisi" });
    }
    const item = new BotKnowledge({
      userId: req.user._id,
      title,
      category: category || "General",
      content,
    });
    await item.save();
    await logActivity(req.user._id, `Menambahkan bot knowledge: ${title}`);
    res.status(201).json(item);
  }),
);

// Update knowledge entry
router.put(
  "/knowledge/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { title, category, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: "Judul dan Konten wajib diisi" });
    }
    const item = await BotKnowledge.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { $set: { title, category, content } },
      { returnDocument: "after" },
    );
    if (!item) {
      return res
        .status(444)
        .json({ message: "Data knowledge tidak ditemukan" });
    }
    await logActivity(req.user._id, `Mengubah bot knowledge: ${title}`);
    res.json(item);
  }),
);

// Delete knowledge entry
router.delete(
  "/knowledge/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const item = await BotKnowledge.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });
    if (!item) {
      return res
        .status(444)
        .json({ message: "Data knowledge tidak ditemukan" });
    }
    await logActivity(req.user._id, `Menghapus bot knowledge: ${item.title}`);
    res.json({ message: "Data knowledge berhasil dihapus", item });
  }),
);

// CSV parser helper
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  if (lines.length <= 1) return result;

  const headers = lines[0].split(",").map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^["']|["']$/g, ""),
  );

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((header, index) => {
      let val = values[index] || "";
      val = val.replace(/^["']|["']$/g, "");
      obj[header] = val;
    });
    result.push(obj);
  }
  return result;
}

// Import knowledge list (JSON or CSV)
router.post(
  "/knowledge/import",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { format, importData } = req.body;
    if (!format || !importData) {
      return res
        .status(400)
        .json({ message: "Format dan data impor wajib dikirim" });
    }

    let items = [];
    try {
      if (format === "csv") {
        items = parseCSV(importData);
      } else if (format === "json") {
        items = JSON.parse(importData);
      } else {
        return res
          .status(400)
          .json({ message: "Format impor tidak valid (harus csv atau json)" });
      }
    } catch (parseErr) {
      return res
        .status(400)
        .json({ message: `Gagal memproses file impor: ${parseErr.message}` });
    }

    if (!Array.isArray(items)) {
      items = [items];
    }

    const savedItems = [];
    for (const item of items) {
      const title = item.judul || item.title || item.Judul;
      const category =
        item.kategori || item.category || item.Kategori || "General";
      const content = item.konten || item.content || item.Konten;

      if (!title || !content) continue; // skip invalid records

      const dbItem = new BotKnowledge({
        userId: req.user._id,
        title,
        category,
        content,
      });
      await dbItem.save();
      savedItems.push(dbItem);
    }

    await logActivity(
      req.user._id,
      `Mengimpor ${savedItems.length} knowledge ke dalam Bot Knowledge`,
    );
    res.status(201).json({
      message: `Berhasil mengimpor ${savedItems.length} data knowledge`,
      count: savedItems.length,
    });
  }),
);

export default router;
