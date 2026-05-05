import express from "express";
import Chat from "../models/Chat.js";

const router = express.Router();

// 🔹 Get all sessions (optionally filtered by vendorId)
router.get("/sessions", async (req, res) => {
  try {
    const { vendorId } = req.query;

    let filter = {};
    if (vendorId) {
      filter.vendorId = vendorId;
    }

    const chats = await Chat.find(filter).sort({ updatedAt: -1 });

    res.json(chats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔹 Save admin reply
router.post("/reply", async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    const chat = await Chat.findOne({ sessionId });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    chat.messages.push({
      role: "assistant",
      content: message,
    });

    await chat.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
