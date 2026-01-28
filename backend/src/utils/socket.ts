import { Socket, Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "@clerk/express";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Chat } from "../models/Chat";

interface SocketWithUserId extends Socket {
  userId: string;
}

// store online users in memory : userId -> socketId
export const onlineUsers: Map<string, string> = new Map();

export const initializeSocket = (httpServer: HttpServer) => {
  if (!process.env.CLERK_SECRET_KEY) {
    console.error(
      "CRITICAL: CLERK_SECRET_KEY is not defined in environment variables.",
    );
    throw new Error(
      "CLERK_SECRET_KEY is missing. Socket initialization aborted.",
    );
  }

  const allowedOrigins = [
    "http://localhost:8081", // Expo Mobile
    "http://localhost:5173", // Vite Web
    process.env.FRONTEND_URL, // Production
  ].filter((origin): origin is string => Boolean(origin && origin.length > 0));

  const io = new SocketServer(httpServer, {
    cors: { origin: allowedOrigins },
  });

  // verify socket connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }

    try {
      const session = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const clerkId = session.sub;

      const user = await User.findOne({ clerkId });
      if (!user) {
        return next(new Error("User not found"));
      }

      (socket as SocketWithUserId).userId = user._id.toString();
      next();
    } catch (error) {
      next(new Error("Authentication error"));
    }
  });

  // the event that is triggered when a user connects
  io.on("connection", (socket) => {
    const userId = (socket as SocketWithUserId).userId;

    // send list of currently connected users
    socket.emit("online-users", { userIds: Array.from(onlineUsers.keys()) });

    //store user in onlineUsers map
    onlineUsers.set(userId, socket.id);

    // notify all users that a new user has connected
    socket.broadcast.emit("user-connected", { userId });

    socket.join(`user:${userId}`);

    socket.on("join-chat", async (chatId: string) => {
      try {
        const chat = await Chat.findOne({
          _id: chatId,
          participants: userId,
        });

        if (!chat) {
          socket.emit("error", {
            message: "You are not a participant in this chat",
          });
          return;
        }

        socket.join(`chat:${chatId}`);
      } catch (error) {
        socket.emit("error", { message: "Failed to join chat" });
      }
    });

    socket.on("leave-chat", (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    // handle sending message
    socket.on(
      "send-message",
      async (data: { chatId: string; text: string }) => {
        try {
          const { chatId, text } = data;

          const trimmedText = text?.trim();
          const MAX_TEXT_LENGTH = 2000;

          if (!trimmedText || trimmedText.length === 0) {
            socket.emit("error", { message: "Message text cannot be empty" });
            return;
          }

          if (trimmedText.length > MAX_TEXT_LENGTH) {
            socket.emit("error", {
              message: `Message is too long. Max ${MAX_TEXT_LENGTH} characters.`,
            });
            return;
          }

          const chat = await Chat.findOne({
            _id: chatId,
            participants: userId,
          });
          if (!chat) {
            socket.emit("error", { message: "Chat not found" });
            return;
          }

          const message = await Message.create({
            chat: chatId,
            sender: userId,
            text: trimmedText,
          });

          chat.lastMessage = message._id;
          chat.lastMessageAt = new Date();
          await chat.save();

          await message.populate("sender", "name avatar");

          // notify all participants that a new message has been sent
          for (const participantId of chat.participants) {
            io.to(`user:${participantId}`).emit("new-message", message);
          }
        } catch (error) {
          socket.emit("error", { message: "Failed to send message" });
        }
      },
    );

    // TODO: handle typing event
    socket.on("typing", async (data) => {});

    // disconnect
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit("user-disconnected", { userId });
    });
  });

  return io;
};
