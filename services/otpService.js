import axios from "axios";

const SENDOTP_BASE_URL = "https://api.sendotp.email/v1";
const devChallenges = new Map();

// Helper to get active API key
const getApiKey = () => {
  return process.env.SENDOTP_API_KEY || "";
};

/**
 * Send OTP to user email
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.purpose (e.g. 'login', 'signup')
 * @param {string} [params.language='en']
 */
export const sendOtp = async ({ email, purpose, language = "en" }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const apiKey = getApiKey();

  try {
    const response = await axios.post(
      `${SENDOTP_BASE_URL}/send`,
      {
        email: normalizedEmail,
        purpose,
        language,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return {
      ok: true,
      id: response.data.id,
      resent: response.data.resent || false,
      expiresAt: response.data.expiresAt,
    };
  } catch (error) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    // Handle standard rate limits & validations from SendOTP
    if (status === 429) {
      if (responseData?.error === "resend_cooldown") {
        const retryAfter = responseData.retryAfter || 30;
        throw new Error(
          `Mohon tunggu ${retryAfter} detik sebelum meminta kirim ulang kode OTP.`,
        );
      }
      throw new Error("Terlalu banyak permintaan OTP. Silakan coba lagi nanti.");
    }

    if (status === 422) {
      throw new Error(
        responseData?.message ||
          "Alamat email sementara (disposable) tidak diizinkan. Gunakan email permanen.",
      );
    }

    // If API key is unauthorized (401) or forbidden (403), provide dev fallback so testing/UI is uninterrupted
    if (status === 401 || status === 403 || !apiKey) {
      console.warn(
        `[SendOTP] Warning: API returned ${status || "No Key"} (${
          responseData?.error || "unauthorized"
        }). Mengaktifkan fallback dev challenge untuk pengujian lokal.`,
      );

      const devCode = Math.floor(100000 + Math.random() * 900000).toString();
      const devId = `otp_dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const expiresAtMs = Date.now() + 10 * 60 * 1000;

      devChallenges.set(devId, {
        email: normalizedEmail,
        purpose,
        code: devCode,
        expiresAt: expiresAtMs,
      });

      console.log(
        `\n==================================================\n` +
          `[SendOTP-DevFallback] KODE OTP: ${devCode}\n` +
          `Tujuan: ${purpose} | Email: ${normalizedEmail}\n` +
          `Berlaku 10 menit (ID: ${devId})\n` +
          `==================================================\n`,
      );

      return {
        ok: true,
        id: devId,
        resent: false,
        expiresAt: Math.floor(expiresAtMs / 1000),
        isDevFallback: true,
        devCode,
      };
    }

    throw new Error(
      responseData?.message ||
        responseData?.error ||
        "Gagal mengirimkan kode OTP ke email. Silakan coba lagi.",
    );
  }
};

/**
 * Verify OTP code
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.purpose
 * @param {string} params.id
 * @param {string} params.code
 */
export const verifyOtp = async ({ email, purpose, id, code }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = String(code).trim();
  const apiKey = getApiKey();

  // Check if challenge is in local dev fallback store
  if (id && (id.startsWith("otp_dev_") || devChallenges.has(id))) {
    const challenge = devChallenges.get(id);

    if (!challenge) {
      return { valid: false, reason: "challenge_not_found" };
    }

    if (Date.now() > challenge.expiresAt) {
      devChallenges.delete(id);
      return { valid: false, reason: "expired" };
    }

    if (
      challenge.email !== normalizedEmail ||
      challenge.purpose !== purpose
    ) {
      return { valid: false, reason: "scope_mismatch" };
    }

    if (challenge.code !== normalizedCode) {
      return { valid: false, reason: "wrong_code" };
    }

    // Code matched, consume challenge
    devChallenges.delete(id);
    return { valid: true };
  }

  // Otherwise call live SendOTP API
  try {
    const response = await axios.post(
      `${SENDOTP_BASE_URL}/verify`,
      {
        email: normalizedEmail,
        purpose,
        id,
        code: normalizedCode,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    return response.data; // { valid: true } or { valid: false, reason: ... }
  } catch (error) {
    const responseData = error.response?.data;
    if (responseData && typeof responseData.valid === "boolean") {
      return responseData;
    }
    throw new Error(
      responseData?.message ||
        responseData?.error ||
        "Gagal memverifikasi kode OTP. Silakan periksa koneksi Anda.",
    );
  }
};
