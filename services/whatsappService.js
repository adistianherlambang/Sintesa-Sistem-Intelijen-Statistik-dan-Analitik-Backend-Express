import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import QRCode from "qrcode";
import axios from "axios";
import WhatsAppSession from "../db/models/WhatsAppSession.js";
import BotKnowledge from "../db/models/BotKnowledge.js";
import Subscription from "../db/models/Subscription.js";

const activeClients = new Map();

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
    console.log(`WhatsApp client already exists for user ${userId}`);
    return activeClients.get(userId.toString());
  }

  // Find or create WhatsAppSession in DB
  let sessionObj = await WhatsAppSession.findOne({ userId });
  if (!sessionObj) {
    sessionObj = new WhatsAppSession({ userId });
    await sessionObj.save();
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId.toString(),
    }),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
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
        { upsert: true }
      );
    } catch (err) {
      console.error(`Error generating QR for user ${userId}:`, err.message);
    }
  });

  client.on("authenticated", () => {
    console.log(`WhatsApp client authenticated successfully for user ${userId}`);
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
        }
      );
    } catch (err) {
      console.error(`Error on ready for user ${userId}:`, err.message);
    }
  });

  client.on("disconnected", async (reason) => {
    try {
      console.log(`WhatsApp client disconnected for user ${userId}:`, reason);
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "disconnected",
          qrCode: "",
        }
      );
      activeClients.delete(userId.toString());
    } catch (err) {
      console.error(`Error on disconnect for user ${userId}:`, err.message);
    }
  });

  client.on("auth_failure", async (msg) => {
    try {
      console.error(`WhatsApp auth failure for user ${userId}:`, msg);
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          status: "disconnected",
          qrCode: "",
        }
      );
      activeClients.delete(userId.toString());
    } catch (err) {
      console.error(`Error on auth failure for user ${userId}:`, err.message);
    }
  });

  client.on("message", async (msg) => {
    // Only process private chats (avoid group chats)
    if (!msg.from.endsWith("@c.us")) return;

    try {
      // 1. Fetch current session configuration and check enabled/active hours
      const session = await WhatsAppSession.findOne({ userId });
      if (!session || !session.botEnabled) return;

      if (!isBotWithinActiveHours(session)) {
        console.log(`Bot for user ${userId} is outside active hours. Skipping reply.`);
        return;
      }

      // 2. Subscription package and limit check
      const sub = await Subscription.findOne({ userId, status: "active" });
      const limit = getMessageLimit(sub);
      
      // Check total messages limit
      if (session.totalMessageCount >= limit) {
        console.log(`User ${userId} bot message limit reached (${session.totalMessageCount}/${limit}). Skipping reply.`);
        return;
      }

      // Increment incoming message counter
      session.incomingCountToday += 1;
      session.totalMessageCount += 1;
      await session.save();

      // 3. Retrieve user's Bot Knowledge base
      const knowledge = await BotKnowledge.find({ userId });
      
      let replyText = "";

      if (knowledge.length === 0) {
        replyText = "Maaf, saat ini belum ada informasi resmi yang tersedia di database kami.";
      } else {
        const knowledgeBaseText = knowledge
          .map((k, i) => `Entri ${i + 1}:\n[Kategori] ${k.category}\n[Judul] ${k.title}\n[Informasi] ${k.content}`)
          .join("\n\n");

        const systemPrompt = `Anda adalah AI WhatsApp Bot Asisten Dinas/Instansi resmi. Tugas Anda adalah membantu menjawab pertanyaan pelanggan dengan sopan dan singkat berdasarkan data "Bot Knowledge Resmi" di bawah ini.

ATURAN PENTING & KETAT:
1. JAWAB HANYA berdasarkan informasi yang disediakan dalam "Bot Knowledge Resmi".
2. Jika pertanyaan di luar konteks, tidak relevan, atau tidak ada dalam data "Bot Knowledge Resmi", jawab dengan ramah: "Maaf, saya hanya dapat membantu menjawab pertanyaan terkait informasi resmi instansi kami."
3. JANGAN berimprovisasi, jangan mengarang informasi, jangan menjawab pertanyaan umum (seperti matematika, pemrograman, resep masakan, dll) di luar data yang diberikan.
4. Jawaban harus singkat, padat, ramah, dan tidak boleh melebihi 100 token.

Bot Knowledge Resmi:
${knowledgeBaseText}

Pertanyaan Pelanggan:
${msg.body}

Jawaban Asisten:`;

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
          console.error("GEMINI_API_KEY not configured in env variables.");
          replyText = "Maaf, sistem asisten AI sedang tidak aktif saat ini.";
        } else {
          try {
            const res = await axios.post(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
              {
                contents: [
                  {
                    parts: [
                      { text: systemPrompt },
                    ],
                  },
                ],
                generationConfig: {
                  maxOutputTokens: 100,
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  "X-goog-api-key": geminiApiKey,
                },
              }
            );

            replyText = res.data.candidates[0].content.parts[0].text.trim();
          } catch (aiErr) {
            console.error("Gemini API Error:", aiErr.message);
            replyText = "Maaf, asisten AI mengalami kegagalan sistem saat memproses pesan Anda.";
          }
        }
      }

      // Send the reply
      await client.sendMessage(msg.from, replyText);

      // Increment replied counts
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          $inc: {
            repliedCountToday: 1,
            totalMessageCount: 1, // Add 1 for the outgoing reply (making it 2 total for incoming+outgoing)
          },
        }
      );

    } catch (err) {
      console.error(`Error processing message for user ${userId}:`, err.message);
    }
  });

  client.initialize().catch((err) => {
    console.error(`Failed to initialize WhatsApp client for user ${userId}:`, err.message);
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
      console.error(`Error destroying WhatsApp client for user ${userId}:`, err.message);
    }
    activeClients.delete(userId.toString());
  }

  await WhatsAppSession.findOneAndUpdate(
    { userId },
    {
      status: "disconnected",
      qrCode: "",
    }
  );
};

/**
 * Get active client instance in memory
 */
export const getActiveClient = (userId) => {
  return activeClients.get(userId.toString());
};
