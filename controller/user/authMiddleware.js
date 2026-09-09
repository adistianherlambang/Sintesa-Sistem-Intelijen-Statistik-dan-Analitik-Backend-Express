import User from "../../db/models/User.js";

/**
 * Express middleware to authenticate the user using a token
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res
        .status(401)
        .json({ message: "Akses ditolak. Token tidak disediakan." });
    }

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

/**
 * Express middleware to restrict route access exclusively to users with 'admin' role
 */
export const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Akses terlarang. Halaman/fitur ini khusus untuk Administrator." });
  }
  next();
};
