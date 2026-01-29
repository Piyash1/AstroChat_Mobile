import express from "express";
import path from "path";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chatRoutes";
import messageRoutes from "./routes/messageRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { clerkMiddleware } from "@clerk/express";

const app = express();

//middleware
app.use(express.json()); //parse json request body
app.use(express.urlencoded({ extended: true })); //parse urlencoded request body
app.use(clerkMiddleware());

//routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

//api routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);

// Error handler middleware (must be at the end)
app.use(errorHandler);

// serve frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../web/dist")));

  app.get("/{*any}", (_, res) => {
    res.sendFile(path.join(__dirname, "../../web/dist/index.html"));
  });
}

export default app;
