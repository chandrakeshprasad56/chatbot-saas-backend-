import express from "express";
import Chat from "../models/Chat.js";
import Product from "../models/Product.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/", async (req, res) => {
  const { sessionId, message } = req.body;

  let chat = await Chat.findOne({ sessionId });

  if (!chat) {
    chat = await Chat.create({
      sessionId,
      messages: [],
    });
  }

  chat.messages.push({ role: "user", content: message });

  // 🔥 Product intelligence
  const products = await Product.find({
    name: { $regex: message, $options: "i" },
  }).limit(5);

  let productContext = "";

  if (products.length > 0) {
    productContext = `
    Available Products:
    ${products
      .map(
        (p) =>
          `Name: ${p.name}, Price: $${p.price}, Description: ${p.description}`
      )
      .join("\n")}
    `;
  }

  const prompt = `
  You are a shop assistant AI.
  Use this product data if relevant:
  ${productContext}

  Conversation history:
  ${chat.messages.map(m => `${m.role}: ${m.content}`).join("\n")}

  Reply to the latest user message naturally.
  `;

  const result = await model.generateContent(prompt);
  const aiReply = result.response.text();

  chat.messages.push({ role: "assistant", content: aiReply });
  await chat.save();

  res.json({ reply: aiReply });
});

export default router;
