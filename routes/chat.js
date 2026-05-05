import express from "express";
import mongoose from "mongoose";
import fetch from "node-fetch";
import Product from "../models/Product.js";
import Chat from "../models/Chat.js";

const router = express.Router();

const CATEGORY_KEYWORDS = {
  Medicine: ["medicine", "medical", "pharmacy", "tablet", "doctor"],
  Grocery: ["grocery", "groceries", "rice", "atta", "oil"],
  Electronics: ["electronics", "mobile", "laptop", "earbuds", "tv"],
  Fashion: ["fashion", "shirt", "jeans", "dress", "shoes"],
  Beauty: ["beauty", "makeup", "skincare", "cosmetic"],
  Hardware: ["hardware", "tools", "drill", "screw", "paint"],
  Stationery: ["stationery", "pen", "notebook", "copy"],
  "Home Essentials": ["home", "kitchen", "cleaner", "detergent"],
};

const sellerIntentConfig = [
  { intent: "seller_top_product", action: "seller_top_product", patterns: ["selling most", "best selling", "top selling", "most sold"] },
  { intent: "seller_sales_diagnosis", action: "seller_sales_diagnosis", patterns: ["sales dropped", "why sales", "low sales", "drop in sales"] },
  { intent: "seller_demand_prediction", action: "seller_demand_prediction", patterns: ["predict", "demand", "next week", "forecast"] },
  { intent: "seller_inventory_alert", action: "seller_inventory_alert", patterns: ["stock", "restock", "inventory"] },
  { intent: "seller_marketing_plan", action: "seller_marketing_plan", patterns: ["marketing", "campaign", "promotion", "instagram", "facebook", "youtube"] },
  { intent: "seller_order_priority", action: "seller_order_priority", patterns: ["priority", "urgent", "vip", "high value"] },
];

const customerIntentConfig = [
  { intent: "order_help", action: "order_help", patterns: ["order", "return", "refund", "shipping", "delivery", "track"] },
  { intent: "complaint_support", action: "complaint_support", patterns: ["complaint", "issue", "problem", "broken", "late"] },
  { intent: "shop_finder", action: "shop_finder", patterns: ["shop", "near me", "open now", "noida", "greater noida", "sector"] },
  { intent: "cart_help", action: "cart_help", patterns: ["cart", "add", "remove", "quantity", "checkout"] },
  { intent: "pricing_offer", action: "pricing_offer", patterns: ["offer", "discount", "cheap", "under", "price"] },
  { intent: "product_recommendation", action: "product_recommendation", patterns: ["recommend", "suggest", "best product"] },
];

const detectCategory = (text) => {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category;
  }
  return null;
};

const extractNumber = (text, regex) => {
  const match = text.match(regex);
  return match?.[1] ? Number(match[1]) : null;
};

const extractFilters = (text) => {
  const lower = text.toLowerCase();
  const maxPrice =
    extractNumber(lower, /under\s*₹?\s*(\d+)/i) ??
    extractNumber(lower, /below\s*₹?\s*(\d+)/i) ??
    extractNumber(lower, /less than\s*₹?\s*(\d+)/i);
  const radiusKm = extractNumber(lower, /(\d+)\s*km/i);
  const minRating = extractNumber(lower, /(\d(?:\.\d)?)\s*(?:star|\*)/i);

  return {
    category: detectCategory(lower),
    openNow: lower.includes("open now") || lower.includes("open"),
    location: lower.includes("greater noida")
      ? "Greater Noida"
      : lower.includes("noida")
      ? "Noida"
      : null,
    maxPrice,
    radiusKm,
    minRating,
  };
};

const findIntent = (text, config) => {
  const lower = text.toLowerCase();
  const hit = config.find((entry) =>
    entry.patterns.some((pattern) => lower.includes(pattern))
  );
  return hit || null;
};

const shouldTreatAsSeller = (userType, message) => {
  if (userType === "seller") return true;
  return !!findIntent(message, sellerIntentConfig);
};

const buildVendorFilter = (vendorId) => {
  if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
    return { vendorId: new mongoose.Types.ObjectId(vendorId) };
  }
  return {};
};

const callOllama = async (prompt) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const aiResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama",
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!aiResponse.ok) return null;
    const data = await aiResponse.json();
    return data?.response?.trim() || null;
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildProductSummary = (products) => {
  const topBySales = [...products]
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 3);

  const lowStock = products
    .filter((product) => typeof product.stock === "number" && product.stock > 0 && product.stock <= 5)
    .slice(0, 4);

  const categoryCounts = products.reduce((acc, product) => {
    const key = product.category || "General";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const trendingCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  return { topBySales, lowStock, trendingCategories };
};

const buildSellerReply = async ({ intent, message, products }) => {
  const summary = buildProductSummary(products);

  if (intent === "seller_top_product") {
    const top = summary.topBySales[0] || products[0];
    return {
      reply: top
        ? `Your strongest product right now is ${top.name}. Focus ads + stock on this SKU first.`
        : "I need product sales data to identify the top-selling product.",
      structured: {
        title: "Top Product Insight",
        bullets: top
          ? [
              `Product: ${top.name}`,
              `Sales count: ${top.salesCount || 0}`,
              "Action: Promote this item in homepage and paid campaigns.",
            ]
          : ["Add products with sales data to unlock this insight."],
      },
    };
  }

  if (intent === "seller_sales_diagnosis") {
    const lowStockNames = summary.lowStock.map((p) => p.name);
    return {
      reply:
        "Sales dips usually come from stock-outs, weaker pricing, lower ratings, or slow delivery promises. Check these first.",
      structured: {
        title: "Sales Drop Diagnosis",
        bullets: [
          lowStockNames.length
            ? `Low stock risk: ${lowStockNames.join(", ")}`
            : "No immediate low-stock alerts detected.",
          "Review top viewed products with low conversion.",
          "Run 3-day offer campaign on slow-moving products.",
        ],
      },
    };
  }

  if (intent === "seller_demand_prediction") {
    return {
      reply: `Next week demand is likely strongest in ${
        summary.trendingCategories.join(", ") || "General"
      }.`,
      structured: {
        title: "Demand Forecast",
        bullets: [
          `Trending categories: ${summary.trendingCategories.join(", ") || "General"}`,
          "Restock top 20% items before weekend.",
          "Bundle slow movers with top sellers for higher conversion.",
        ],
      },
    };
  }

  if (intent === "seller_inventory_alert") {
    return {
      reply: summary.lowStock.length
        ? `Low stock alert for ${summary.lowStock.length} products.`
        : "No critical low-stock products right now.",
      structured: {
        title: "Inventory Alert",
        bullets: summary.lowStock.length
          ? summary.lowStock.map((product) => `${product.name}: ${product.stock} left`)
          : ["Inventory is stable based on available data."],
      },
    };
  }

  if (intent === "seller_marketing_plan") {
    return {
      reply:
        "Use a 7-day campaign cycle: awareness content, offer post, and review/testimonial reel.",
      structured: {
        title: "Quick Marketing Plan",
        bullets: [
          "Instagram: 1 short reel/day for top 3 products.",
          "Facebook: 3 offer posts/week with local delivery messaging.",
          "YouTube: 1 demo or customer story/week.",
        ],
      },
    };
  }

  if (intent === "seller_order_priority") {
    return {
      reply:
        "Prioritize high-value orders, delayed dispatch orders, and repeat buyers first.",
      structured: {
        title: "Order Priority Rules",
        bullets: [
          "Sort by amount desc + delivery ETA asc.",
          "Handle delayed orders before normal queue.",
          "Mark repeat high-value users as priority customers.",
        ],
      },
    };
  }

  const ollamaReply = await callOllama(
    `You are a seller operations assistant. Reply with short, actionable bullets. Question: ${message}`
  );

  return {
    reply:
      ollamaReply ||
      "I can help with top product, sales diagnosis, demand prediction, stock alerts, and campaign planning.",
    structured: {
      title: "Seller Assistant",
      bullets: ["Ask: 'Which product is selling most?'", "Ask: 'Why are sales dropped?'", "Ask: 'Predict demand for next week.'"],
    },
  };
};

const buildCustomerReply = async ({ intent, message, products, filters }) => {
  const categoryProducts = products
    .filter((product) => (filters.category ? product.category === filters.category : true))
    .filter((product) => (filters.maxPrice ? Number(product.price || 0) <= filters.maxPrice : true))
    .slice(0, 5);

  if (intent === "order_help") {
    return {
      reply:
        "For order help: check tracking, delivery ETA, and return window in your Orders page.",
      structured: {
        title: "Order Help",
        bullets: [
          "Returns usually allowed within 7 days of delivery.",
          "Use order tracking for live status.",
          "If delayed, raise support ticket with order ID.",
        ],
      },
    };
  }

  if (intent === "complaint_support") {
    const ticket = `SUP-${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      reply: `I am sorry for the issue. Ticket ${ticket} created. Share order ID + issue screenshot for faster support.`,
      structured: {
        title: "Complaint Registered",
        bullets: [
          `Ticket ID: ${ticket}`,
          "Attach product photos/screenshot.",
          "Support team will respond in priority queue.",
        ],
      },
      meta: { ticketId: ticket },
    };
  }

  if (intent === "shop_finder") {
    const whyRecommended = [
      filters.openNow ? "Open-now preference detected." : "Availability filter can be applied.",
      filters.location ? `Location preference: ${filters.location}.` : "No location provided; defaults to nearby shops.",
      filters.maxPrice ? `Budget intent under ₹${filters.maxPrice}.` : "No budget cap detected.",
      filters.category ? `Category preference: ${filters.category}.` : "All categories considered.",
    ];

    return {
      reply:
        "I can find matching shops. Open Find Shops and apply these auto-filters for best results.",
      filters,
      whyRecommended,
      structured: {
        title: "Shop Finder Guidance",
        bullets: [
          "Sort by nearest + rating 4+.",
          "Use open-now + fast-delivery filters.",
          "Shortlist 3 shops and compare reviews.",
        ],
      },
    };
  }

  if (intent === "cart_help") {
    return {
      reply:
        "Cart controls are active: add/remove item, quantity update, stock validation, and auto total update.",
      structured: {
        title: "Cart Help",
        bullets: [
          "Increase/decrease quantity from cart panel.",
          "Over-ordering is blocked by stock validation.",
          "Out-of-stock items can be auto-removed.",
        ],
      },
    };
  }

  if (intent === "pricing_offer") {
    return {
      reply:
        "Use top-rated + offer filters to find better prices before checkout.",
      structured: {
        title: "Offer Tips",
        bullets: [
          "Set max price in AI search filters.",
          "Prefer products with strong ratings and active offers.",
          "Compare 2-3 shops for delivery + final price.",
        ],
      },
    };
  }

  if (intent === "product_recommendation") {
    if (!categoryProducts.length) {
      return {
        reply: "No matching products found for your current filters. Try a broader category or higher budget.",
        structured: {
          title: "Recommendation",
          bullets: ["Tip: remove strict budget/rating filter and retry."],
        },
      };
    }

    const list = categoryProducts.map((product) => `${product.name} - ₹${product.price}`).join("\n");
    return {
      reply: `Recommended products:\n${list}`,
      structured: {
        title: "Top Matches",
        bullets: categoryProducts.slice(0, 3).map((product) => `${product.name} (${product.category || "General"})`),
      },
      meta: {
        productIds: categoryProducts.map((product) => String(product._id)),
      },
    };
  }

  const ollamaReply = await callOllama(
    `You are a customer shopping assistant. Keep replies concise and useful. Question: ${message}`
  );

  return {
    reply:
      ollamaReply ||
      "I can help with product recommendations, shop finder, order support, cart help, and complaints.",
    structured: {
      title: "Customer Assistant",
      bullets: ["Ask: 'Best medical shop open now near me'", "Ask: 'Suggest products under 500'"],
    },
  };
};

router.get("/intents", (_req, res) => {
  res.json({
    customer: customerIntentConfig.map(({ intent, action, patterns }) => ({
      intent,
      action,
      examples: patterns.slice(0, 2),
    })),
    seller: sellerIntentConfig.map(({ intent, action, patterns }) => ({
      intent,
      action,
      examples: patterns.slice(0, 2),
    })),
  });
});

router.post("/", async (req, res) => {
  try {
    const { vendorId = "public", sessionId, message, userType = "customer" } = req.body || {};

    if (!sessionId || !message || !String(message).trim()) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }

    let chat = await Chat.findOne({ vendorId, sessionId });
    if (!chat) {
      chat = new Chat({ vendorId, sessionId, messages: [] });
    }

    const cleanMessage = String(message).trim();
    const filters = extractFilters(cleanMessage);
    const sellerMode = shouldTreatAsSeller(userType, cleanMessage);
    const sellerIntent = findIntent(cleanMessage, sellerIntentConfig);
    const customerIntent = findIntent(cleanMessage, customerIntentConfig);

    chat.messages.push({
      role: "user",
      content: cleanMessage,
      audience: sellerMode ? "seller" : "customer",
      intent: sellerMode ? sellerIntent?.intent || "seller_general" : customerIntent?.intent || "customer_general",
    });

    const vendorFilter = buildVendorFilter(vendorId);
    const products = await Product.find(vendorFilter).limit(120);

    const intent = sellerMode
      ? sellerIntent?.intent || "seller_general"
      : customerIntent?.intent || (filters.category ? "product_recommendation" : "customer_general");

    const action = sellerMode
      ? sellerIntent?.action || "seller_assistant"
      : customerIntent?.action || (filters.category ? "product_recommendation" : "general_chat");

    const botPayload = sellerMode
      ? await buildSellerReply({ intent, message: cleanMessage, products })
      : await buildCustomerReply({ intent, message: cleanMessage, products, filters });

    const responsePayload = {
      audience: sellerMode ? "seller" : "customer",
      role: sellerMode ? "seller_bot" : "customer_bot",
      intent,
      action,
      reply: botPayload.reply,
      structured: botPayload.structured || null,
      filters: botPayload.filters || null,
      whyRecommended: botPayload.whyRecommended || [],
      meta: botPayload.meta || null,
    };

    chat.messages.push({
      role: "assistant",
      content: responsePayload.reply,
      audience: responsePayload.audience,
      intent: responsePayload.intent,
      action: responsePayload.action,
      meta: responsePayload.meta,
    });

    await chat.save();
    return res.json(responsePayload);
  } catch (err) {
    console.error("CHAT ERROR:", err);
    return res.status(500).json({ error: err.message || "Chat server failed" });
  }
});

export default router;
