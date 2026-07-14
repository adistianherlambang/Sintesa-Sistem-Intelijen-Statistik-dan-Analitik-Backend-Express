import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import axios from "axios";
import WhatsAppSession from "../db/models/WhatsAppSession.js";
import BotKnowledge from "../db/models/BotKnowledge.js";
import Subscription from "../db/models/Subscription.js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logActivity } from "../controller/user/activityController.js";


import { OpenAI } from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Initialize OpenAI client for Mistral API once at module scope
const openai = new OpenAI({
  apiKey: process.env.MISTRAL_API_KEY || "OCPWoSOISDgB3I19HovoNoqCJhKHMlLh",
  baseURL: "https://api.mistral.ai/v1",
});

/**
 * Helper to get the current date in YYYY-MM-DD local format
 */
export const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Checks and resets daily statistics if the day has changed
 */
export const checkAndResetDailyStats = async (session) => {
  const todayStr = getLocalDateString();
  if (session.lastResetDate !== todayStr) {
    session.incomingCountToday = 0;
    session.repliedCountToday = 0;
    session.lastResetDate = todayStr;
    await session.save();
    console.log(`[WhatsApp Bot] Daily stats reset for user ${session.userId} to date: ${todayStr}`);
  }
};

/**
 * Safely delete the local session credentials folder
 */
const deleteSessionFolder = (userId) => {
  const sessionPath = path.resolve(__dirname, `../../.wwebjs_auth/session-${userId}`);
  if (fs.existsSync(sessionPath)) {
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`[WhatsApp Bot] Cleaned up local auth folder for user ${userId}: ${sessionPath}`);
    } catch (err) {
      console.error(`[WhatsApp Bot] Failed to delete auth folder for user ${userId}:`, err.message);
    }
  }
};

const activeClients = new Map();

// Track hourly message frequency per contact (Rule 13)
const contactMessageTracker = new Map();

// Track session active message count and resting cooldowns (Rule 12)
const sessionRestTracker = new Map();

/**
 * Checks if the bot can send a message to the contact (limit: 4 per hour)
 */
const canSendMessage = (userId, contactId) => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  if (!contactMessageTracker.has(userId.toString())) {
    return true;
  }
  const userTracker = contactMessageTracker.get(userId.toString());
  if (!userTracker.has(contactId)) {
    return true;
  }

  // Clean up old timestamps and update tracker
  const timestamps = userTracker.get(contactId).filter((ts) => ts > oneHourAgo);
  userTracker.set(contactId, timestamps);

  return timestamps.length < 4;
};

/**
 * Records a sent message timestamp for a contact
 */
const recordSentMessage = (userId, contactId) => {
  const now = Date.now();
  if (!contactMessageTracker.has(userId.toString())) {
    contactMessageTracker.set(userId.toString(), new Map());
  }
  const userTracker = contactMessageTracker.get(userId.toString());
  if (!userTracker.has(contactId)) {
    userTracker.set(contactId, []);
  }
  userTracker.get(contactId).push(now);
};

/**
 * Checks if the session is currently in a random rest period (Rule 12)
 */
const isSessionResting = (userId) => {
  const tracker = sessionRestTracker.get(userId.toString());
  if (!tracker) return false;

  const now = Date.now();
  if (tracker.nextAvailableTime && now < tracker.nextAvailableTime) {
    const remainingMin = Math.round((tracker.nextAvailableTime - now) / 60000);
    console.log(`[WhatsApp Bot] Session for user ${userId} is currently resting. Remaining: ${remainingMin} minutes.`);
    return true;
  }
  return false;
};

/**
 * Tracks session message count and triggers a random rest period if threshold reached
 */
const trackSessionMessage = (userId) => {
  if (!sessionRestTracker.has(userId.toString())) {
    sessionRestTracker.set(userId.toString(), {
      messagesSinceLastRest: 0,
      nextAvailableTime: null,
    });
  }

  const tracker = sessionRestTracker.get(userId.toString());
  tracker.messagesSinceLastRest += 1;

  // Choose a random message threshold between 15 and 25 messages if not already set
  const threshold = tracker.threshold || (Math.floor(Math.random() * (25 - 15 + 1)) + 15);
  tracker.threshold = threshold;

  if (tracker.messagesSinceLastRest >= threshold) {
    // Rest duration between 15 and 30 minutes
    const restDurationMs = (Math.floor(Math.random() * (30 - 15 + 1)) + 15) * 60 * 1000;
    tracker.nextAvailableTime = Date.now() + restDurationMs;
    tracker.messagesSinceLastRest = 0;
    // Set a new random threshold for the next block
    tracker.threshold = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
    console.log(`[WhatsApp Bot] Session for user ${userId} triggered rest period for ${restDurationMs / 60000} minutes after ${threshold} messages.`);
  }
};

/**
 * Helper to check active hours
 */
const isBotWithinActiveHours = (session) => {
  const { activeTimeStart, activeTimeEnd } = session;
  if (!activeTimeStart || !activeTimeEnd) return true;

  const now = new Date();
  // Format now time in HH:MM (local server time)
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hours}:${minutes}`;

  if (activeTimeStart <= activeTimeEnd) {
    return currentTime >= activeTimeStart && currentTime <= activeTimeEnd;
  } else {
    // Overnight active hours (e.g. 22:00 to 06:00)
    return currentTime >= activeTimeStart || currentTime <= activeTimeEnd;
  }
};

/**
 * Helper to get user's message limit based on subscriptionId
 */
const getMessageLimit = (subscription) => {
  if (!subscription || subscription.status !== "active") {
    return 100; // Allow 100 free/test messages for trial/unsubscribed users so they can test the bot
  }
  const subId = subscription.subscriptionId;
  if (subId.startsWith("wa_only")) {
    return 1000;
  }
  if (subId.startsWith("wa_analisis")) {
    return 1500;
  }
  return 100;
};

/**
 * Initialize WhatsApp Client for a User
 */
export const initializeWhatsAppClient = async (userId) => {
  if (activeClients.has(userId.toString())) {
    const existingClient = activeClients.get(userId.toString());
    const sessionObj = await WhatsAppSession.findOne({ userId });
    if (sessionObj && sessionObj.status === "connected") {
      console.log(`WhatsApp client already connected for user ${userId}`);
      return existingClient;
    }

    console.log(`Stale WhatsApp client found in memory for user ${userId}. Destroying it before re-initializing.`);
    try {
      await existingClient.destroy();
    } catch (destroyErr) {
      console.warn(`Error destroying stale client for user ${userId}:`, destroyErr.message);
    }
    activeClients.delete(userId.toString());
  }

  // Find or create WhatsAppSession in DB
  let sessionObj = await WhatsAppSession.findOne({ userId });
  if (!sessionObj) {
    sessionObj = new WhatsAppSession({ userId });
  }

  // Reset session status and QR code immediately to show loading on UI
  sessionObj.status = "connecting";
  sessionObj.qrCode = "";
  await sessionObj.save();

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId.toString(),
      dataPath: path.resolve(__dirname, "../../.wwebjs_auth"),
    }),
    webVersionCache: {
      type: "remote",
      remotePath:
        "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr) => {
    try {
      console.log(`QR received for user ${userId}`);
      const qrDataUrl = await QRCode.toDataURL(qr);
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "connecting",
          qrCode: qrDataUrl,
          lastSync: null,
        },
        { upsert: true, returnDocument: "after" },
      );
    } catch (err) {
      console.error(`Error generating QR for user ${userId}:`, err.message);
    }
  });

  client.on("authenticated", () => {
    console.log(
      `WhatsApp client authenticated successfully for user ${userId}`,
    );
  });

  client.on("ready", async () => {
    try {
      console.log(`WhatsApp client ready for user ${userId}`);
      const phone = client.info.wid.user;
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "connected",
          phoneNumber: phone,
          qrCode: "",
          sessionId: phone,
          lastSync: new Date(),
        },
        { returnDocument: "after" },
      );
      await logActivity(userId, "Berhasil menyambungkan akun WhatsApp");
    } catch (err) {
      console.error(`Error on ready for user ${userId}:`, err.message);
    }
  });

  client.on("disconnected", async (reason) => {
    try {
      console.log(`WhatsApp client disconnected for user ${userId}:`, reason);
      try {
        await client.destroy();
      } catch (destroyErr) {
        console.warn(
          `Error calling destroy on disconnect for user ${userId}:`,
          destroyErr.message,
        );
      }
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "disconnected",
          qrCode: "",
        },
        { returnDocument: "after" },
      );
      activeClients.delete(userId.toString());
      await logActivity(userId, "Akun WhatsApp terputus");
    } catch (err) {
      console.error(`Error on disconnect for user ${userId}:`, err.message);
    }
  });

  client.on("auth_failure", async (msg) => {
    try {
      console.error(`WhatsApp auth failure for user ${userId}:`, msg);
      try {
        await client.destroy();
      } catch (destroyErr) {
        console.warn(
          `Error calling destroy on auth failure for user ${userId}:`,
          destroyErr.message,
        );
      }
      // Delete session folder to clean up corrupted files
      deleteSessionFolder(userId);
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "disconnected",
          qrCode: "",
        },
        { returnDocument: "after" },
      );
      activeClients.delete(userId.toString());
    } catch (err) {
      console.error(`Error on auth failure for user ${userId}:`, err.message);
    }
  });

  client.on("message", async (msg) => {
    console.log(`\n--- [WhatsApp Message Event] ---`);
    console.log(`Received message from: ${msg.from}`);
    console.log(`Message body: "${msg.body}"`);

    // Only process private chats (avoid group chats)
    const isPrivateChat =
      msg.from.endsWith("@c.us") || msg.from.endsWith("@lid");
    if (!isPrivateChat) {
      console.log(`Skipping non-private/group message from ${msg.from}`);
      return;
    }

    // Rule 3: Only reply to messages received in the last 1 minute (60 seconds)
    const nowTime = Date.now();
    const msgTimeMs = msg.timestamp * 1000;
    if (nowTime - msgTimeMs > 60000) {
      console.log(`[WhatsApp Bot] Message from ${msg.from} is too old (${Math.round((nowTime - msgTimeMs)/1000)}s ago). Skipping reply.`);
      return;
    }

    try {
      // 1. Fetch current session configuration and check enabled/active hours
      const session = await WhatsAppSession.findOne({ userId });
      if (!session) {
        console.log(`No WhatsApp session found in database for user ${userId}`);
        return;
      }

      await checkAndResetDailyStats(session);

      console.log(`Bot enabled: ${session.botEnabled}`);
      if (!session.botEnabled) {
        console.log(`Bot is currently disabled. Skipping reply.`);
        return;
      }

      const withinHours = isBotWithinActiveHours(session);
      console.log(
        `Bot within active hours (${session.activeTimeStart} - ${session.activeTimeEnd}): ${withinHours}`,
      );
      if (!withinHours) {
        console.log(`Outside active hours. Skipping reply.`);
        return;
      }

      // Check resting period (Rule 12)
      if (isSessionResting(userId)) {
        console.log(`[WhatsApp Bot] Session is resting. Skipping reply.`);
        return;
      }

      // Check frequency limit per contact (Rule 13)
      if (!canSendMessage(userId, msg.from)) {
        console.log(`[WhatsApp Bot] Frequency limit (max 4 per hour) exceeded for contact ${msg.from}. Skipping reply.`);
        return;
      }

      // Get chat object
      const chat = await msg.getChat();

      // 1. Mark as read immediately (Rule 5)
      await chat.sendSeen();

      // Check if we have replied before in this chat (Rule 14) and prevent consecutive messages (Rule 2)
      let hasRepliedBefore = false;
      try {
        const historyMsgs = await chat.fetchMessages({ limit: 10 });
        hasRepliedBefore = historyMsgs.some(m => m.fromMe);
        if (historyMsgs.length > 0) {
          const lastMsg = historyMsgs[historyMsgs.length - 1];
          if (lastMsg.fromMe) {
            console.log(`[WhatsApp Bot] Last message in chat with ${msg.from} was sent by us. Skipping reply to avoid consecutive messages.`);
            return;
          }
        }
      } catch (historyErr) {
        console.warn(`[WhatsApp Bot] Failed to fetch message history for ${msg.from}:`, historyErr.message);
      }

      // 2. Subscription package and limit check
      const sub = await Subscription.findOne({ userId, status: "active" });
      const limit = getMessageLimit(sub);
      console.log(
        `Active subscription found: ${sub ? sub.subscriptionId : "None (Free/Trial)"}`,
      );
      console.log(
        `Message Limit: ${limit}, Current count: ${session.totalMessageCount}`,
      );

      // Check total messages limit
      if (session.totalMessageCount >= limit) {
        console.log(
          `Message limit reached (${session.totalMessageCount}/${limit}). Skipping reply.`,
        );
        return;
      }

      // Increment incoming message counter
      session.incomingCountToday += 1;
      session.totalMessageCount += 1;
      await session.save();
      console.log(
        `Incoming count incremented. Today: ${session.incomingCountToday}, Total: ${session.totalMessageCount}`,
      );

      // 3. Retrieve user's Bot Knowledge base
      const knowledge = await BotKnowledge.find({ userId });
      console.log(`Found ${knowledge.length} knowledge entries in database.`);

      let replyText = "";

      if (knowledge.length === 0) {
        replyText =
          "Maaf, saat ini belum ada informasi resmi yang tersedia di database kami.";
        console.log(`No knowledge base found. Using default reply.`);
      } else {
        const knowledgeBaseText = knowledge
          .map(
            (k, i) =>
              `Entri ${i + 1}:\n[Kategori] ${k.category}\n[Judul] ${k.title}\n[Informasi] ${k.content}`,
          )
          .join("\n\n");

        let systemPrompt = `Anda adalah AI WhatsApp Bot Asisten Dinas/Instansi resmi. Tugas Anda adalah membantu menjawab pertanyaan pelanggan dengan sopan, jelas, dan informatif berdasarkan data "Bot Knowledge Resmi" di bawah ini.

          ATURAN PENTING & KETAT:
          1. JAWAB HANYA berdasarkan informasi yang disediakan dalam "Bot Knowledge Resmi".
          2. Jika pertanyaan di luar konteks, tidak relevan, atau tidak ada dalam data "Bot Knowledge Resmi", jawab dengan ramah: "Maaf, saya hanya dapat membantu menjawab pertanyaan terkait informasi resmi instansi kami."
          3. JANGAN berimprovisasi, jangan mengarang informasi, jangan menjawab pertanyaan umum (seperti matematika, pemrograman, resep masakan, dll) di luar data yang diberikan.
          4. Jawaban harus jelas, lengkap, dan mudah dipahami. Gunakan kalimat yang sopan dan informatif. Jika memungkinkan, sertakan detail penting seperti alamat, jam operasional, atau langkah-langkah yang diperlukan agar pelanggan mendapat informasi yang cukup tanpa perlu bertanya ulang.
          5. Hindari jawaban yang terlalu singkat atau tidak memberikan informasi yang cukup. Usahakan menjawab secara lengkap namun tetap ringkas dan tidak bertele-tele.
          6. BATAS MAKSIMAL jawaban adalah 80 kata. Jangan melebihi batas ini.
          7. Jangan gunakan karakter llm dikarenakan ini untuk wbatsapp, untuk bold hanya *bold* 
          8. Variasikan sapaan, susunan kalimat, dan emoji secukupnya di setiap pesan agar terkesan natural dan ramah (misalnya menggunakan variasi sapaan "Halo", "Hai", "Selamat pagi/siang/sore", dll). Jangan menggunakan template jawaban yang kaku dan identik di setiap respons.

          Bot Knowledge Resmi:
          ${knowledgeBaseText}

          Pertanyaan Pelanggan:
          ${msg.body}

          Jawaban Asisten:`;

        if (!hasRepliedBefore) {
          systemPrompt += `\n\n[PENTING] Ini adalah pesan pertama dari pelanggan ini. Jawaban Anda HARUS singkat, jelas, langsung menjawab intinya, tidak mengandung promosi, tidak berisi link/tautan apapun, dan maksimal 40 kata.`;
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        try {
          console.log(
            `[WhatsApp Bot] Sending prompt to Mistral API for ${msg.from}...`,
          );
          const response = await openai.chat.completions.create({
            model: "mistral-small-latest",
            max_tokens: 150,
            messages: [
              {
                role: "user",
                content: systemPrompt,
              },
            ],
          });
          replyText = response.choices[0].message.content.trim();
          console.log(
            `[WhatsApp Bot] Mistral reply successfully generated for ${msg.from}: "${replyText}"`,
          );
        } catch (mistralErr) {
          console.warn(
            `[WhatsApp Bot] ⚠ Gagal menggunakan Mistral untuk ${msg.from}, beralih ke Gemini sebagai fallback:`,
            mistralErr.message,
          );

          if (!geminiApiKey) {
            console.error("GEMINI_API_KEY not configured in env variables and Mistral failed.");
            replyText = "Maaf, sistem asisten AI sedang tidak aktif saat ini.";
          } else {
            try {
              console.log(
                `[WhatsApp Bot] Sending prompt to Gemini API for ${msg.from} (with auto-retry support)...`,
              );

              const maxAttempts = 3;
              let success = false;

              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  if (attempt > 1) {
                    console.log(
                      `Retrying Gemini API call (attempt ${attempt}/${maxAttempts})...`,
                    );
                  }
                  const res = await axios.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
                    {
                      contents: [
                        {
                          parts: [{ text: systemPrompt }],
                        },
                      ],
                      generationConfig: {
                        maxOutputTokens: 150,
                      },
                    },
                    {
                      headers: {
                        "Content-Type": "application/json",
                        "X-goog-api-key": geminiApiKey,
                      },
                    },
                  );

                  replyText =
                    res.data.candidates[0].content.parts[0].text.trim();
                  console.log(
                    `[WhatsApp Bot] Gemini reply successfully generated on attempt ${attempt} for ${msg.from}: "${replyText}"`,
                  );
                  success = true;
                  break;
                } catch (attemptErr) {
                  console.warn(
                    `[WhatsApp Bot] Gemini API attempt ${attempt} failed for ${msg.from}: ${attemptErr.response?.data?.error?.message || attemptErr.message}`,
                  );
                  if (attempt === maxAttempts) {
                    throw attemptErr;
                  }
                  // Wait 1.5 seconds before retrying
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                }
              }
            } catch (aiErr) {
              console.error(
                `[WhatsApp Bot] Gemini API final error after all attempts for ${msg.from}:`,
                aiErr.message,
              );
              replyText =
                "Maaf, asisten AI mengalami kegagalan sistem saat memproses pesan Anda.";
            }
          }
        }
      }

      // Sanitize the generated reply text (converting http to https links)
      if (replyText) {
        replyText = replyText.replace(/http:\/\//gi, "https://");
      }

      // Delay to the next minute if the current minute matches the message timestamp minute (Rule 4)
      const msgTime = new Date(msg.timestamp * 1000);
      const nowBeforeDelay = new Date();
      if (
        nowBeforeDelay.getMinutes() === msgTime.getMinutes() &&
        nowBeforeDelay.getDate() === msgTime.getDate() &&
        nowBeforeDelay.getMonth() === msgTime.getMonth() &&
        nowBeforeDelay.getFullYear() === msgTime.getFullYear()
      ) {
        const msUntilNextMinute = (60 - nowBeforeDelay.getSeconds()) * 1000 - nowBeforeDelay.getMilliseconds();
        // Add dynamic typing delay to make it natural and not at :00 seconds
        const extraDelay = Math.floor(Math.random() * 10000) + 5000; // 5-15 seconds
        const totalDelay = msUntilNextMinute + extraDelay;
        console.log(`[WhatsApp Bot] Message received in the same minute. Delaying reply by ${totalDelay / 1000}s to reply in the next minute.`);
        await new Promise((resolve) => setTimeout(resolve, totalDelay));
      }

      // Simulate typing and send message
      let typingStateActive = false;
      try {
        // Fetch latest message history right before sending to ensure no newer messages or bot replies have occurred
        const finalChat = await msg.getChat();
        const finalHistory = await finalChat.fetchMessages({ limit: 5 });
        if (finalHistory.length > 0) {
          const lastMsg = finalHistory[finalHistory.length - 1];
          if (lastMsg.fromMe) {
            console.log(`[WhatsApp Bot] Aborting reply to ${msg.from} because the last message in chat is already from us.`);
            return;
          }
          if (lastMsg.id._serialized !== msg.id._serialized) {
            console.log(`[WhatsApp Bot] Aborting reply to ${msg.from} because a newer message has been received.`);
            return;
          }
        }

        // 2. Pre-typing delay: simulate reading the message before starting to type (1-3 seconds)
        const preTypingDelay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
        console.log(`[WhatsApp Bot] Pre-typing delay: ${preTypingDelay}ms before starting to type...`);
        await new Promise((resolve) => setTimeout(resolve, preTypingDelay));

        // 3. Start typing indicator
        await chat.sendStateTyping();
        typingStateActive = true;

        // 4. Determine random delay based on reply length
        let delayMs = 0;
        const charCount = replyText.length;
        if (charCount <= 50) {
          // Short message: 2 to 5 seconds
          delayMs = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
        } else if (charCount <= 150) {
          // Medium message: 5 to 10 seconds
          delayMs = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
        } else {
          // Long message: 8 to 15 seconds
          delayMs = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
        }

        console.log(`[WhatsApp Bot] Simulating typing status for ${delayMs}ms (message length: ${charCount} chars)...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // 5. Stop typing indicator
        await chat.clearState();
        typingStateActive = false;

        // 6. Send the reply
        console.log(`[WhatsApp Bot] Sending reply message back to: ${msg.from}`);
        await client.sendMessage(msg.from, replyText);
        console.log(`[WhatsApp Bot] Reply successfully sent to: ${msg.from}`);

        // Record tracking data after successful send
        recordSentMessage(userId, msg.from);
        trackSessionMessage(userId);
      } catch (sendErr) {
        console.error(`[WhatsApp Bot] Error during typing simulation or message sending:`, sendErr.message);
      } finally {
        if (typingStateActive) {
          try {
            await chat.clearState();
          } catch (clearErr) {
            console.warn(`[WhatsApp Bot] Failed to clear typing state:`, clearErr.message);
          }
        }
      }

      // Increment replied counts
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          $inc: {
            repliedCountToday: 1,
            totalMessageCount: 1, // Add 1 for the outgoing reply (making it 2 total for incoming+outgoing)
          },
        },
        { returnDocument: "after" },
      );
      console.log(`Updated replied counts in database.`);
    } catch (err) {
      console.error(
        `Error processing message for user ${userId}:`,
        err.message,
      );
    }
  });

  client.initialize().catch(async (err) => {
    console.error(
      `Failed to initialize WhatsApp client for user ${userId}:`,
      err.message,
    );
    try {
      await client.destroy();
    } catch (destroyErr) {
      console.warn(
        `Error destroying client after init failure for user ${userId}:`,
        destroyErr.message,
      );
    }
    activeClients.delete(userId.toString());
    await WhatsAppSession.findOneAndUpdate(
      { userId },
      {
        status: "disconnected",
        qrCode: "",
      },
    ).catch((dbErr) =>
      console.error(
        `Error resetting session status after init failure:`,
        dbErr.message,
      ),
    );
  });

  activeClients.set(userId.toString(), client);
  return client;
};

/**
 * Destroy WhatsApp client for a user
 */
export const destroyWhatsAppClient = async (userId) => {
  const client = activeClients.get(userId.toString());
  if (client) {
    try {
      await client.destroy();
      console.log(`WhatsApp client destroyed for user ${userId}`);
    } catch (err) {
      console.error(
        `Error destroying WhatsApp client for user ${userId}:`,
        err.message,
      );
    }
    activeClients.delete(userId.toString());
  }

  // Delete local session folder to ensure clean state next connect
  deleteSessionFolder(userId);

  await WhatsAppSession.findOneAndUpdate(
    { userId },
    {
      status: "disconnected",
      qrCode: "",
    },
    { returnDocument: "after" },
  );
};

/**
 * Get active client instance in memory
 */
export const getActiveClient = (userId) => {
  return activeClients.get(userId.toString());
};

/**
 * Destroy all active WhatsApp clients (useful on process exit)
 */
export const cleanupAllClients = async () => {
  console.log("Cleaning up all active WhatsApp clients...");
  for (const [userId, client] of activeClients.entries()) {
    try {
      await client.destroy();
      console.log(`WhatsApp client successfully destroyed for user ${userId}`);
    } catch (err) {
      console.error(
        `Failed to destroy client for user ${userId} during cleanup:`,
        err.message,
      );
    }
  }
  activeClients.clear();
};
