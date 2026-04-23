import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs,
  getDoc,
  doc,
  updateDoc,
  Timestamp 
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

import * as cheerio from "cheerio";
import axios from "axios";
import CryptoJS from "crypto-js";

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "Sentinel Engine Operational 🛡️" });
  });

  app.post("/api/check-cache", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "Content required" });

      const hash = CryptoJS.SHA256(content).toString();
      
      // Look in global factory checking base first (High Authority)
      const qKnown = query(collection(db, "known_fakes"), where("hash", "==", hash), limit(1));
      const snapKnown = await getDocs(qKnown);

      if (!snapKnown.empty) {
        return res.json({ cached: true, source: "internal_base", data: snapKnown.docs[0].data() });
      }

      // Look in general verification logs (Low Authority Cache)
      const qLogs = query(collection(db, "verifications"), where("hash", "==", hash), limit(1));
      const snapLogs = await getDocs(qLogs);

      if (!snapLogs.empty) {
        return res.json({ cached: true, source: "history_cache", data: snapLogs.docs[0].data() });
      }

      res.json({ cached: false, hash });
    } catch (err) {
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

      const $ = cheerio.load(response.data);
      const title = $("title").text() || $("h1").first().text();
      const description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
      
      // Domain reputation simulation
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

  // Admin: Verification middleware
  const adminAuth = async (req: any, res: any, next: any) => {
    const adminId = req.headers["x-admin-id"];
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    
    try {
      const userRef = doc(db, "users", adminId as string);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().isAdmin) {
        next();
      } else {
        res.status(403).json({ error: "Admin access required" });
      }
    } catch (e) {
      res.status(500).json({ error: "Auth check failed" });
    }
  };

  // Admin Routes
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
      await updateDoc(userRef, { balance: Number(balance) });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update balance" });
    }
  });

  app.post("/api/admin/set-premium", adminAuth, async (req, res) => {
    const { userId, isPremium } = req.body;
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { isPremium: !!isPremium });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update premium status" });
    }
  });

  app.get("/api/historico", async (req, res) => {
    try {
      const { userId } = req.query;
      let q;
      if (userId && userId !== "anonymous") {
        q = query(collection(db, "verifications"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(30));
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
    } catch (error) {
      res.status(500).json({ error: "Falha ao recuperar histórico." });
    }
  });

  // Serve static assets
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
