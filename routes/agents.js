import express from "express";

const router = express.Router();

const agents = [
  {
    id: "sales",
    name: "Sales Agent",
    goal: "Recommend products, bundles, and offers to increase sales."
  },
  {
    id: "support",
    name: "Support Agent",
    goal: "Answer FAQs, returns, shipping, and order status."
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    goal: "Create campaign ideas, captions, and promo messages."
  },
  {
    id: "analytics",
    name: "Analytics Agent",
    goal: "Summarize trends and insights for seller dashboard."
  }
];

router.get("/", (req, res) => {
  res.json(agents);
});

router.post("/run", async (req, res) => {
  const { agentId, input } = req.body || {};
  const agent = agents.find(a => a.id === agentId);

  if (!agent) {
    return res.status(400).json({ error: "Unknown agent" });
  }

  const reply = `Agent: ${agent.name}\nGoal: ${agent.goal}\n\nSuggestion:\n${input || "Tell me what you need."}`;

  res.json({ agent: agentId, reply });
});

export default router;
