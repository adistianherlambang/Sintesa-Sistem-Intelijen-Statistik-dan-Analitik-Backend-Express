import User from "../../db/models/User.js";

/**
 * Express middleware to authenticate the user using a token
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Akses ditolak. Token tidak disediakan." });
    }

    const token = authHeader.split(" ")[1];
    const user = await User.findOne({ token }).lean();

    if (!user) {
      return res
        .status(401)
        .json({ message: "Sesi tidak valid atau kedaluwarsa." });
    }

    // Attach user object (excluding password) to request
    const { password, ...safeUser } = user;
    req.user = safeUser;

    next();
  } catch (err) {
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server saat autentikasi." });
  }
};
