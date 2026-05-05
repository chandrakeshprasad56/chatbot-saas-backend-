// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  plan: { type: String, default: "free" },
});

export default mongoose.model("User", userSchema);
