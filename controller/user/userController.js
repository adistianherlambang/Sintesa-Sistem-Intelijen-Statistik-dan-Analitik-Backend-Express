import crypto from "crypto";
import User from "../../db/models/User.js";
import { findUnifiedCity } from "../dashboard/helpers.js";

// Helper: Hash password using built-in crypto
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

// Helper: Verify password using built-in crypto
const verifyPassword = (password, storedPassword) => {
  if (!storedPassword || !storedPassword.includes(":")) return false;
  const [salt, hash] = storedPassword.split(":");
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === verifyHash;
};

/**
 * Register a new user with email, password, name, and cityChoice
 */
export const registerUser = async (email, password, name, cityChoice) => {
  if (!email || !password || !cityChoice) {
    throw new Error("Email, password, dan kota wajib diisi");
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("Email sudah terdaftar");
  }

  const city = findUnifiedCity(cityChoice);
  if (!city) {
    throw new Error("Kota tidak ditemukan atau tidak valid");
  }

  const hashedPassword = hashPassword(password);
  
  const user = new User({
    email: email.toLowerCase(),
    password: hashedPassword,
    profile: {
      name: name || "",
      avatar: "",
    },
    location: city,
  });

  await user.save();

  // Return safe user details (without password)
  const userObj = user.toObject();
  delete userObj.password;
  return userObj;
};

/**
 * Login user and generate token
 */
export const loginUser = async (email, password) => {
  if (!email || !password) {
    throw new Error("Email dan password wajib diisi");
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !verifyPassword(password, user.password)) {
    throw new Error("Email atau password salah");
  }

  // Generate session token
  const token = crypto.randomBytes(32).toString("hex");
  user.token = token;
  user.lastLogin = new Date();
  await user.save();

  const userObj = user.toObject();
  delete userObj.password;
  return {
    user: userObj,
    token: token,
  };
};

/**
 * Update user profile details
 */
export const updateUserProfile = async (userId, profileData) => {
  const updateFields = {};
  if (profileData.name !== undefined) updateFields["profile.name"] = profileData.name;
  if (profileData.avatar !== undefined) updateFields["profile.avatar"] = profileData.avatar;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true }
  ).select("-password").lean();

  if (!user) {
    throw new Error("User tidak ditemukan");
  }

  return user;
};
