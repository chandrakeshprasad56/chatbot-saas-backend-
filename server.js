

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import mongoose from "mongoose";

import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import agentRoutes from "./routes/agents.js";

dotenv.config();
const PORT = process.env.PORT || 8001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/final_year_project";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const allowedOrigins = CLIENT_ORIGIN.split(",").map((x) => x.trim()).filter(Boolean);

// ✅ Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// 1️⃣ Create express app
const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!allowedOrigins.length || allowedOrigins.includes("*")) return callback(null, true);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true
}));
app.use(express.json());

// 2️⃣ Register API routes
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agents", agentRoutes);

// 3️⃣ Create HTTP server
const server = http.createServer(app);

// 4️⃣ Attach Socket.io
const io = new Server(server, {
  cors: { origin: "*" },
});

// 5️⃣ Room-based Socket logic
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on("join_room", (sessionId) => {
    socket.join(sessionId);
    console.log("Joined room:", sessionId);
  });

  // Send message to specific room only
  socket.on("send_message", ({ sessionId, message }) => {
    io.to(sessionId).emit("receive_message", message);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// 6️⃣ Start server (ONLY ONCE)
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
