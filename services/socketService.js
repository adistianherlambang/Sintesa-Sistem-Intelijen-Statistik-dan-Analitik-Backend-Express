import { Server } from "socket.io";
import User from "../db/models/User.js";

let ioInstance = null;

/**
 * Initialize Socket.io Server
 */
export const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      origin: "*", // Permits requests from the frontend client
      methods: ["GET", "POST"],
    },
  });

  // Authentication middleware using user token lookup in MongoDB
  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      // Extract raw token if passed as "Bearer <token>"
      const cleanToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;

      const user = await User.findOne({ token: cleanToken }).lean();
      if (!user) {
        return next(new Error("Authentication error: Invalid session"));
      }

      // Attach user ID to the socket object
      socket.userId = user._id.toString();
      next();
    } catch (err) {
      console.error("Socket authentication error:", err.message);
      next(new Error("Authentication error: Server failure"));
    }
  });

  ioInstance.on("connection", (socket) => {
    console.log(`WebSocket connected: ${socket.id} for user ${socket.userId}`);

    // Join a room named after the user's ObjectId
    socket.join(socket.userId);

    socket.on("disconnect", () => {
      console.log(`WebSocket disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
};

/**
 * Broadcast event only to a specific user's room (private updates)
 */
export const emitToUser = (userId, event, data) => {
  if (ioInstance) {
    ioInstance.to(userId.toString()).emit(event, data);
  }
};

/**
 * Get Socket.io Server instance
 */
export const getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.io is not initialized!");
  }
  return ioInstance;
};
