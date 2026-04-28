import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs,
  getDoc,
  doc,
  updateDoc,
  arrayUnion,
  Timestamp
} from "firebase/firestore";

// Read Firebase config from JSON file
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

import { load } from "cheerio";
import axios from "axios";
import CryptoJS from "crypto-js";

async function startServer() {
  console.log("Starting Sentinel Server...");
  
  let firebaseApp;
  let db: any;
  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase initialized successfully on server");
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // Global logger
  app.use((req, res, next) => {
    console.log(`[SERVER] ${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  app.all("/api/*", (req, res, next) => {
    if (!db) {
      return res.status(503).json({ error: "Firebase Service Unavailable on Server" });
    }
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "Sentinel Engine Operational 🛡️", timestamp: new Date().toISOString() });
  });

  app.post("/api/check-cache", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "Content required" });

      const hash = CryptoJS.SHA256(content).toString();
      
      const qKnown = query(collection(db, "known_fakes"), where("hash", "==", hash), limit(1));
      const snapKnown = await getDocs(qKnown);

      if (!snapKnown.empty) {
        return res.json({ cached: true, source: "internal_base", data: snapKnown.docs[0].data() });
      }

      const qLogs = query(collection(db, "verifications"), where("hash", "==", hash), limit(1));
      const snapLogs = await getDocs(qLogs);

      if (!snapLogs.empty) {
        return res.json({ cached: true, source: "history_cache", data: snapLogs.docs[0].data() });
      }

      res.json({ cached: false, hash });
    } catch (err: any) {
      console.error("Cache Error:", err);
      res.status(500).json({ error: "Cache check failed" });
    }
  });

  app.post("/api/scrape-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        },
        timeout: 8000
      });

      const $ = load(response.data);
      const title = $("title").text() || $("h1").first().text();
      const description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
      
      const domain = new URL(url).hostname;
      const isDubious = /fake|suspicious|weird-news|clickbait/i.test(domain);

      let bodyContent = "";
      $("p").each((i, el) => {
        const t = $(el).text().trim();
        if (t.length > 30) bodyContent += t + " ";
        if (bodyContent.length > 2500) return false;
      });

      res.json({
        title: title.trim(),
        description: description.trim(),
        content: bodyContent.trim().substring(0, 3000),
        domain,
        isDubious
      });
    } catch (error: any) {
      res.status(500).json({ error: "Falha ao processar a URL." });
    }
  });

  const adminAuth = async (req: any, res: any, next: any) => {
    const adminId = req.headers["x-admin-id"];
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      const userSnap = await getDoc(doc(db, "users", adminId as string));
      if (userSnap.exists() && userSnap.data()?.isAdmin) {
        next();
      } else {
        res.status(403).json({ error: "Admin access required" });
      }
    } catch (e) {
      res.status(500).json({ error: "Auth check failed" });
    }
  };

  app.get("/api/admin/users", adminAuth, async (req, res) => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/set-balance", adminAuth, async (req, res) => {
    const { userId, balance } = req.body;
    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const currentBalance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
      const newBalance = Number(balance);
      const diff = newBalance - currentBalance;

      const transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: Timestamp.now(),
        amount: Math.abs(diff),
        type: diff > 0 ? "acquired" : "consumed",
        description: "Ajuste administrativo de saldo"
      };

      await updateDoc(userRef, { 
        balance: newBalance,
        transactions: arrayUnion(transaction)
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update balance" });
    }
  });

  app.post("/api/admin/set-premium", adminAuth, async (req, res) => {
    const { userId, isPremium } = req.body;
    try {
      await updateDoc(doc(db, "users", userId), { isPremium: !!isPremium });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update premium status" });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const userId = req.query.userId;
      let q;
      
      console.log("Fetching history for user:", userId);
      
      if (userId && userId !== "anonymous") {
        q = query(collection(db, "verifications"), where("userId", "==", userId as string), orderBy("createdAt", "desc"), limit(30));
      } else {
        q = query(collection(db, "verifications"), orderBy("createdAt", "desc"), limit(15));
      }
      
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
        };
      });
      res.json(history);
    } catch (error: any) {
      console.error("History API Error:", error);
      res.status(500).json({ error: "Falha ao recuperar histórico." });
    }
  });

  // Alias for backward compatibility
  app.get("/api/historico", (req, res) => {
    res.redirect(301, `/api/history?${new URLSearchParams(req.query as any).toString()}`);
  });

  // Catch-all for API routes to avoid proxy 404 confusion
  app.all("/api/*", (req, res) => {
    console.warn(`Unmatched API call: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Route Not Found", path: req.url });
  });

  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sentinel Server online at port ${PORT}`);
  });
}

startServer();
