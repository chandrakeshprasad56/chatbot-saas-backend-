// models/Chat.js
import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true },
    content: { type: String, required: true },
    intent: { type: String },
    action: { type: String },
    audience: { type: String, enum: ["customer", "seller", "system"] },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    userId: { 
      type: String
    },

    vendorId: { 
      type: String
    },

    sessionId: { 
      type: String, 
      required: true 
    },

    messages: [chatMessageSchema],

    // optional simplified fields for quick access
    message: String,   
    response: String,
  },
  { timestamps: true }
);

export default mongoose.model("Chat", chatSchema);
