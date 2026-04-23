import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
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
  setDoc,
  Timestamp,
  doc,
  getDocFromServer,
  updateDoc
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { 
  Search, 
  History, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Cpu, 
  Loader2, 
  RefreshCcw,
  ShieldCheck,
  Info,
  Image as ImageIcon,
  Video,
  Link as LinkIcon,
  Upload,
  User as UserIcon,
  LogOut,
  LayoutGrid,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  FileText,
  BarChart3,
  ShieldAlert,
  Globe,
  Settings,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Mail,
  Key,
  Smartphone,
  Eye,
  EyeOff
} from "lucide-react";
import CryptoJS from "crypto-js";

import { SiteLogo } from "./components/SiteLogo";

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type VerificationType = "text" | "image" | "video" | "link";
type ViewMode = "dashboard" | "history" | "investigator" | "admin" | "support" | "settings" | "api" | "terms" | "privacy" | "status" | "api_docs" | "profile";
type Theme = "light" | "dark" | "system";

interface Verification {
  id?: string;
  type: VerificationType;
  content: string;
  result: string;
  explanation: string;
  technicalDetails?: string;
  reliabilityScore: number;
  riskLevel: "Baixo" | "Médio" | "Alto";
  sourceRating: "Confiável" | "Duvidosa" | "Desconhecida";
  sources?: string[];
  references?: { title: string, url: string, type: "original" | "factcheck" | "context" }[];
  userId: string;
  createdAt: any;
  hash?: string;
  feedbackVotes?: { up: number, down: number };
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isAdmin?: boolean;
  isPremium?: boolean;
  reputationScore: number;
  loginType: "google" | "manual";
  balance?: number;
  createdAt: any;
}

export default function App() {
  const [view, setView] = useState<ViewMode>("dashboard");
  const [activeTab, setActiveTab] = useState<VerificationType>("text");
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("sentinel_theme") as Theme) || "system");
  
  // Admin Data
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [adminFilters, setAdminFilters] = useState({ premium: "all", loginType: "all" });
  const [adminSubView, setAdminSubView] = useState<"users" | "trends">("users");

  // Inputs
  const [inputText, setInputText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Verification | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [viralTrends, setViralTrends] = useState<any[]>([]);

  // Manual Auth States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMethod, setAuthMethod] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [manualDisplayName, setManualDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchViralTrends();
    const interval = setInterval(fetchViralTrends, 300000); // 5 min
    return () => clearInterval(interval);
  }, []);

  const fetchViralTrends = async () => {
    try {
      const q = query(collection(db, "viral_trends"), orderBy("updatedAt", "desc"), limit(5));
      const snap = await getDocs(q);
      if (snap.empty) {
        // Fallback or Initial Data
        setViralTrends([
          { title: "Alimento X causa cura milagrosa", result: "Falso", viralityScore: 92 },
          { title: "Novo imposto sobre herança aprovado", result: "Manipulado", viralityScore: 75 }
        ]);
      } else {
        setViralTrends(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      console.error("Erro ao carregar tendências");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          // Fetch/Sync User Profile using Doc ID = UID
          const userRef = doc(db, "users", u.uid);
          const userSnap = await getDoc(userRef);
          
          const isMasterAdmin = u.email === "andrewsantoss658@gmail.com";
          const identifiedLoginType = u.providerData[0]?.providerId === "google.com" ? "google" : "manual";
          
          let profile: UserProfile;
          if (!userSnap.exists()) {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email!,
              displayName: u.displayName || manualDisplayName || "Agente Sentinel",
              photoURL: u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName || "Agente"}`,
              isAdmin: isMasterAdmin,
              isPremium: isMasterAdmin,
              loginType: identifiedLoginType,
              balance: isMasterAdmin ? 1000 : 0,
              reputationScore: 100,
              createdAt: Timestamp.now()
            };
            await setDoc(userRef, newProfile);
            profile = newProfile;
          } else {
            profile = userSnap.data() as UserProfile;
            // Sync loginType if missing
            if (!profile.loginType) {
               profile.loginType = identifiedLoginType;
               await updateDoc(userRef, { loginType: identifiedLoginType });
            }
            // Ensure master admin always has privileges even if manually revoked in DB
            if (isMasterAdmin && !profile.isAdmin) {
              profile.isAdmin = true;
              profile.isPremium = true;
              await updateDoc(userRef, { isAdmin: true, isPremium: true });
            }
          }
          setUser(profile);
          fetchHistory(u.uid);
        } else {
          setUser(null);
          fetchHistory();
        }
      } catch (err: any) {
        console.error("Erro na sincronização de perfil:", err);
        setError("Erro ao sincronizar seu perfil. Tente atualizar a página.");
      }
    });

    const savedCount = localStorage.getItem("sentinel_checks");
    if (savedCount) setCheckCount(parseInt(savedCount));

    return () => unsubscribe();
  }, []);

  // Theme Management
  useEffect(() => {
    const root = window.document.documentElement;
    const updateTheme = () => {
      const isDark = 
        theme === "dark" || 
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    updateTheme();
    localStorage.setItem("sentinel_theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => updateTheme();
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, [theme]);

  // Admin Fetch
  useEffect(() => {
    if (view === "admin" && user?.isAdmin) {
      fetchAdminUsers();
    }
  }, [view, user]);

  const fetchAdminUsers = async () => {
    try {
      const res = await axios.get("/api/admin/users", {
        headers: { "x-admin-id": user?.uid }
      });
      setAdminUsers(res.data);
    } catch (e) {
      setError("Falha ao carregar usuários administrativos.");
    }
  };

  const updateAdminUser = async (uid: string, type: "balance" | "premium", value: any) => {
    try {
      const endpoint = type === "balance" ? "/api/admin/set-balance" : "/api/admin/set-premium";
      const payload = type === "balance" ? { userId: uid, balance: value } : { userId: uid, isPremium: value };
      
      await axios.post(endpoint, payload, {
        headers: { "x-admin-id": user?.uid }
      });
      fetchAdminUsers();
    } catch (e) {
      setError("Erro na operação administrativa.");
    }
  };

  const fetchHistory = async (uid?: string) => {
    try {
      const response = await axios.get(`/api/historico${uid ? `?userId=${uid}` : ""}`);
      setHistory(response.data);
    } catch (err) {
      console.error("Histórico indisponível");
    }
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      if (authMethod === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: manualDisplayName });
        // Profile creation is handled by onAuthStateChanged
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowAuthModal(false);
      resetAuthForm();
    } catch (err: any) {
      setError(err.message || "Erro na autenticação manual.");
    } finally {
      setAuthLoading(false);
    }
  };

  const resetAuthForm = () => {
    setEmail("");
    setPassword("");
    setManualDisplayName("");
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (err) {
      setError("Falha na autenticação Google.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  const verify = async () => {
    if (!user && checkCount >= 1) {
      setError("Limite de convidado atingido. Crie uma conta gratuita para continuar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let analysis: any;
      let contentToHash = "";
      let metadata: any = {};

      if (activeTab === "text") {
        if (!inputText.trim()) throw new Error("Texto vazio.");
        contentToHash = inputText;
      } else if (activeTab === "link") {
        if (!urlInput.trim()) throw new Error("URL inválida.");
        contentToHash = urlInput;
        // Layer 2: Scrape & Meta
        const scrape = await axios.post("/api/scrape-url", { url: urlInput });
        metadata = scrape.data;
      } else if (activeTab === "image") {
        if (!filePreview) throw new Error("Nenhuma imagem selecionada.");
        contentToHash = filePreview.substring(0, 5000); // Sampling
      }

      // Layer 1: Cache Check
      const cacheRes = await axios.post("/api/check-cache", { content: contentToHash });
      if (cacheRes.data.cached) {
        setResult({
          ...cacheRes.data.data,
          createdAt: cacheRes.data.data.createdAt?.toDate?.()?.toISOString() || cacheRes.data.data.createdAt
        });
        setLoading(false);
        return;
      }

      // Layer 3: AI Intensive Analysis
      const hash = CryptoJS.SHA256(contentToHash).toString();
      const prompt = `Você é um perito em verificação de fatos (Sentinel Engine).
      Analise o conteúdo abaixo com base em:
      1. Veracidade dos fatos.
      2. Reputação da fonte (se link: ${metadata.domain || "N/A"}).
      3. Sinais de manipulação ou IA.
      5. Fontes de referência: links diretos para leitura adicional ou desmentidos oficiais.

      Retorne rigorosamente um JSON:
      {
        "result": "Verdadeiro | Falso | Manipulado | IA",
        "explanation": "Resumo executivo do veredito",
        "technicalDetails": "Análise técnica profunda detalhando evidências",
        "reliabilityScore": 0-100,
        "riskLevel": "Baixo | Médio | Alto",
        "sourceRating": "Confiável | Duvidosa | Desconhecida",
        "sources": ["links obrigatórios para validar o veredito"],
        "references": [
          { "title": "Título da Matéria", "url": "URL da Fonte", "type": "original | factcheck | context" }
        ]
      }

      Conteúdo: ${inputText || urlInput || "Análise de Imagem/Mídia"}
      Metadata: ${JSON.stringify(metadata)}`;

      let aiResponse;
      if (activeTab === "image" && filePreview) {
        const [mime, data] = filePreview.split(",");
        aiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { data, mimeType: mime.split(":")[1].split(";")[0] } }
            ]
          },
          config: { responseMimeType: "application/json" }
        });
      } else {
        aiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
      }

      analysis = JSON.parse(aiResponse.text.trim());

      const finalRecord: Verification = {
        type: activeTab,
        content: urlInput || inputText || "Arquivo de Mídia",
        hash,
        ...analysis,
        userId: user?.uid || "anonymous",
        createdAt: Timestamp.now(),
        feedbackVotes: { up: 0, down: 0 }
      };

      // Save & Update
      await addDoc(collection(db, "verifications"), finalRecord);
      setResult({ ...finalRecord, createdAt: new Date().toISOString() });

      if (!user) {
        const nc = checkCount + 1;
        setCheckCount(nc);
        localStorage.setItem("sentinel_checks", nc.toString());
      }
      fetchHistory(user?.uid);
    } catch (err: any) {
      setError(err.message || "Erro crítico no motor de análise.");
    } finally {
      setLoading(false);
    }
  };

  const getReliabilityColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (score >= 50) return "text-amber-600 bg-amber-50 border-amber-100";
    return "text-rose-600 bg-rose-50 border-rose-100";
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Sidebar Navigation */}
      <aside className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-8 flex flex-col fixed inset-y-0 hidden lg:flex">
        <div className="flex items-center justify-center mb-12">
          <SiteLogo className="w-48 h-48" />
        </div>

        <nav className="space-y-2 flex-grow">
          <div onClick={() => setView("dashboard")} className={`nav-item ${view === "dashboard" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
            <LayoutGrid className="w-5 h-5" /> Início
          </div>
          <div onClick={() => setView("history")} className={`nav-item ${view === "history" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
            <History className="w-5 h-5" /> Histórico
          </div>
          <div onClick={() => setView("investigator")} className={`nav-item ${view === "investigator" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
            <ShieldAlert className="w-5 h-5" /> Investigador
          </div>
          
          {user?.isAdmin && (
            <div onClick={() => setView("admin")} className={`nav-item ${view === "admin" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
              <ShieldCheck className="w-5 h-5" /> Painel Admin
            </div>
          )}

          <div className="pt-8 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 px-4">Recursos</p>
            <div onClick={() => setView("api")} className={`nav-item ${view === "api" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
              <Globe className="w-5 h-5" /> API Pública
            </div>
            <div onClick={() => setView("settings")} className={`nav-item ${view === "settings" ? "nav-item-active" : "nav-item-inactive dark:text-slate-400 dark:hover:bg-slate-800"}`}>
              <Settings className="w-5 h-5" /> Configurações
            </div>
          </div>
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
             {[
               { id: "light", icon: CheckCircle2 }, // Using CheckCircle2 as a placeholder for Sun if lucide-react has it
               { id: "system", icon: Cpu },
               { id: "dark", icon: Lock } // Placeholder for Moon
             ].map(t => (
               <button 
                 key={t.id} 
                 onClick={() => setTheme(t.id as Theme)}
                 className={`flex-1 flex justify-center py-1.5 rounded-lg transition-all ${theme === t.id ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600" : "text-slate-400"}`}
               >
                 <t.icon className="w-4 h-4" />
               </button>
             ))}
          </div>

          {user ? (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <img src={user.photoURL} className="w-10 h-10 rounded-xl" />
              <div className="flex-grow overflow-hidden">
                <p className="text-xs font-bold truncate flex items-center gap-1">
                  {user.displayName}
                  {user.email === "andrewsantoss658@gmail.com" && <span className="text-[8px] text-rose-500 font-black uppercase">Master</span>}
                </p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-[10px] text-slate-500 font-medium">Online</p>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500"><LogOut className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={handleLogin} className="btn-primary w-full shadow-lg shadow-blue-500/10">Entrar p/ Salvar</button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow lg:ml-72 bg-[#fdfdfe] dark:bg-slate-950 min-h-screen transition-colors duration-300">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view === "dashboard" ? (
              <SiteLogo className="h-10 w-10" />
            ) : (
              <h2 className="font-display font-bold text-slate-900 dark:text-white capitalize italic">{view}</h2>
            )}
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="flex gap-2">
              <span className="status-badge bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Motor: Gemini 3.0</span>
              <span className="status-badge bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">v2.5 Professional</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Busca rápida..." className="bg-transparent border-none text-[11px] focus:ring-0 outline-none w-48 font-medium dark:text-white" />
            </div>
            <button 
              onClick={() => setView("support")}
              className={`relative p-2 transition-colors ${view === "support" ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-xl" : "text-slate-400 hover:text-blue-600"}`}
            >
              <HelpCircle className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white dark:border-slate-900" />
            </button>
          </div>
        </header>

        <div className="max-w-5xl mx-auto p-12 space-y-12">
          {view === "dashboard" && (
            <>
              {/* Verification Tools */}
              <section className="space-y-8">
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-bold text-3xl text-slate-900 dark:text-white">Analise a Integridade</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-xl">Envie suspeitas de desinformação para o motor de checagem multi-camada do Sentinel.</p>
                </div>

                <div className="card-pro p-1.5 flex bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit">
                  {[
                    { id: "text", icon: FileText, label: "Conteúdo Escrito" },
                    { id: "image", icon: ImageIcon, label: "Mídia Visual" },
                    { id: "link", icon: LinkIcon, label: "Link / Domínio" },
                    { id: "video", icon: Video, label: "Vídeo / Deepfake" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as VerificationType)}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        activeTab === tab.id 
                        ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" 
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="card-pro p-10 relative dark:bg-slate-900 border-none">
                  <div className="space-y-6">
                    {activeTab === "text" && (
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Insira o texto suspeito ou notícia para análise cruzada..."
                        className="w-full h-48 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/50 transition-all resize-none text-lg leading-relaxed font-medium"
                      />
                    )}

                    {activeTab === "link" && (
                      <div className="relative">
                        <LinkIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                          type="url"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="Ex: https://noticia-duvidosa.com.br/artigo"
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-6 pl-14 pr-6 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/50 transition-all text-lg font-medium"
                        />
                      </div>
                    )}

                    {activeTab === "image" && (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-48 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer group"
                      >
                        {filePreview ? (
                          <img src={filePreview} className="h-full w-full object-contain p-4 rounded-2xl" />
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-4" />
                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Arraste a imagem ou clique p/ carregar</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2 font-bold">Detecção EXIF e Inconsistências</p>
                          </>
                        )}
                        <input type="file" ref={fileInputRef} onChange={(e) => {
                          if (e.target.files?.[0]) {
                            const f = e.target.files[0];
                            setFile(f);
                            const reader = new FileReader();
                            reader.onload = (re) => setFilePreview(re.target?.result as string);
                            reader.readAsDataURL(f);
                          }
                        }} className="hidden" />
                      </div>
                    )}

                    {activeTab === "video" && (
                      <div className="w-full h-48 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center bg-slate-50/50 opacity-60">
                        <Lock className="w-8 h-8 text-slate-300 mb-4" />
                        <p className="text-sm font-semibold text-slate-500 italic">Módulo de Vídeo Biométrico indisponível no Plano Free</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4">
                      <div className="flex gap-4">
                        <button 
                          onClick={verify} 
                          disabled={loading}
                          className="btn-primary min-w-[200px]"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Iniciar Verificação"}
                        </button>
                        <button onClick={() => { setInputText(""); setUrlInput(""); setFile(null); setFilePreview(null); setResult(null); setError(null); }} className="btn-secondary">Limpar</button>
                      </div>
                      
                      {!user && (
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Carga Gratuita</p>
                          <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(checkCount / 1) * 100}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Analysis Result */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4 text-rose-700">
                    <AlertTriangle className="w-6 h-6" />
                    <span className="text-sm font-semibold">{error}</span>
                  </motion.div>
                )}

                {result && (
                  <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className={`card-pro p-8 flex flex-col items-center justify-center gap-4 text-center dark:bg-slate-900 border-none ${getReliabilityColor(result.reliabilityScore)}`}>
                        <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60">Smart Reliability Score</h4>
                        <span className="font-display font-black text-6xl tracking-tighter">{result.reliabilityScore}%</span>
                        <div className="h-1.5 w-full bg-slate-200/30 rounded-full overflow-hidden">
                          <div className="h-full bg-current transition-all" style={{ width: `${result.reliabilityScore}%` }} />
                        </div>
                      </div>

                      <div className="card-pro p-8 flex flex-col gap-6 justify-center dark:bg-slate-900 border-none">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nível de Risco</span>
                          <span className={`status-badge ${result.riskLevel === 'Baixo' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : result.riskLevel === 'Médio' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>{result.riskLevel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avaliação de Fonte</span>
                          <span className={`status-badge ${result.sourceRating === 'Confiável' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{result.sourceRating}</span>
                        </div>
                      </div>

                      <div className="card-pro p-8 flex flex-col gap-3 justify-center dark:bg-slate-900 border-none">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Veredito Final</h4>
                        <div className="flex items-center gap-3">
                          {result.result.includes("Verdadeiro") ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <ShieldAlert className="w-6 h-6 text-rose-500" />}
                          <span className="font-display font-black text-2xl uppercase tracking-tight dark:text-white">{result.result}</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-pro p-10 bg-white dark:bg-slate-900 border-none space-y-8">
                      <div className="space-y-4">
                        <h5 className="font-display font-bold text-xl dark:text-white">Resumo do Verificador</h5>
                        <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed font-medium">"{result.explanation}"</p>
                      </div>

                      <div className="space-y-4 pt-8 border-t border-slate-100 dark:border-slate-800">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Análise do Investigador (Técnico)</h5>
                        <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-loose font-medium leading-relaxed">{result.technicalDetails}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-6 pt-8 border-t border-slate-100 dark:border-slate-800">
                        {result.references && result.references.length > 0 && (
                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {result.result.includes("Verdadeiro") ? "Fontes para Aprofundamento" : "Evidências e Checagem"}
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {result.references.map((ref, i) => (
                                <a 
                                  key={i} 
                                  href={ref.url} 
                                  target="_blank" 
                                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-blue-500/30 transition-all group"
                                >
                                  <div className="flex flex-col gap-1 overflow-hidden">
                                    <span className="text-xs font-bold dark:text-white truncate pr-4">{ref.title}</span>
                                    <span className="text-[9px] font-black uppercase tracking-tight text-blue-600 dark:text-blue-400">
                                      {ref.type === "factcheck" ? "Checagem de Fatos" : ref.type === "original" ? "Fonte Original" : "Contexto Extra"}
                                    </span>
                                  </div>
                                  <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex gap-4">
                            {user?.isAdmin && (
                            <button 
                              onClick={async () => {
                                if (!result) return;
                                try {
                                  await addDoc(collection(db, "known_fakes"), {
                                    ...result,
                                    createdAt: Timestamp.now()
                                  });
                                  alert("Adicionado à Base Global de Fatos!");
                                } catch (e) {
                                  alert("Erro ao promover resultado.");
                                }
                              }}
                              className="btn-secondary border-blue-200 text-blue-600 hover:bg-blue-50"
                            >
                              Promover à Base Global
                            </button>
                          )}
                          <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <ThumbsUp className="w-3.5 h-3.5" /> Útil
                          </button>
                          <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <ThumbsDown className="w-3.5 h-3.5" /> Irrelevante
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.section>
                )}
              </AnimatePresence>

              {/* Real-time Monitor Section */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="card-pro p-8 bg-slate-900 border-none">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-display font-bold text-white flex items-center gap-2">
                       <TrendingUp className="w-5 h-5 text-blue-500" /> Viralidade Crítica
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Monitoramento 24h</span>
                  </div>
                  <div className="space-y-4">
                    {viralTrends.map((item, i) => (
                      <div 
                        key={i} 
                        onClick={() => {
                          setInputText(item.title);
                          setActiveTab("text");
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          // Automatically trigger verify if desired, or let user click
                        }}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                      >
                        <p className="text-[11px] font-bold text-slate-300 truncate pr-4 group-hover:text-white transition-colors">{item.title}</p>
                        <div className="flex items-center gap-3">
                          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${item.result === 'Falso' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{item.result}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-500 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-pro p-8 border-slate-100 flex flex-col justify-center">
                  <BarChart3 className="w-10 h-10 text-slate-200 mb-6" />
                  <h3 className="font-display font-bold text-slate-900 text-xl mb-3">Redução de Custos com IA</h3>
                  <p className="text-sm text-slate-500 mb-6">Graças ao nosso motor de cache e hashing SHA-256, reduzimos em 42% o processamento redundante esta semana.</p>
                  <div className="flex gap-3">
                    <div className="px-3 py-1 bg-slate-100 text-[9px] font-bold uppercase rounded-lg text-slate-500">Hits de Cache: 1,2k</div>
                    <div className="px-3 py-1 bg-slate-100 text-[9px] font-bold uppercase rounded-lg text-slate-500">Economia: $240.00</div>
                  </div>
                </div>
              </section>
            </>
          )}

          {view === "history" && (
            <section className="space-y-8">
              <h2 className="font-display font-bold text-3xl dark:text-white">Logs de Verificação</h2>
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="py-20 text-center card-pro dark:bg-slate-900 border-none">
                    <History className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">Nenhum registro encontrado em seu cluster de dados.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="card-pro p-6 flex flex-col md:flex-row items-center gap-8 group dark:bg-slate-900 border-none">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${getReliabilityColor(item.reliabilityScore)}`}>
                        <span className="font-black text-sm">{item.reliabilityScore}%</span>
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-1">
                           <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.type}</span>
                           <span className="text-xs font-bold text-slate-900 dark:text-slate-200">{item.result}</span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-lg font-medium">{item.content}</p>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 italic">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
                        <ChevronRight className="w-5 h-5 text-slate-200 dark:text-slate-800 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {view === "admin" && user?.isAdmin && (
             <section className="space-y-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                 <div>
                    <h2 className="font-display font-bold text-3xl dark:text-white">Gestão Extensiva</h2>
                    <p className="text-slate-500 dark:text-slate-400">Controle de agentes e inteligência viral.</p>
                 </div>
                 <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                    <button 
                      onClick={() => setAdminSubView("users")}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${adminSubView === "users" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400"}`}
                    >
                      Usuários
                    </button>
                    <button 
                      onClick={() => setAdminSubView("trends")}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${adminSubView === "trends" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400"}`}
                    >
                      Viralidade
                    </button>
                 </div>
               </div>

               {adminSubView === "users" ? (
                 <div className="space-y-6">
                   <div className="flex flex-wrap items-center justify-end gap-2">
                       <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <Search className="w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Filtrar por nome/email..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none text-xs outline-none w-48 dark:text-white" 
                          />
                       </div>
                       <select 
                         value={adminFilters.loginType}
                         onChange={(e) => setAdminFilters({ ...adminFilters, loginType: e.target.value })}
                         className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold dark:text-slate-300"
                       >
                         <option value="all">Logins: Todos</option>
                         <option value="google">Google</option>
                         <option value="x">X (Twitter)</option>
                         <option value="manual">Manual</option>
                       </select>
                       <select 
                         value={adminFilters.premium}
                         onChange={(e) => setAdminFilters({ ...adminFilters, premium: e.target.value })}
                         className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold dark:text-slate-300"
                       >
                         <option value="all">Planos: Todos</option>
                         <option value="premium">Apenas Premium</option>
                         <option value="free">Apenas Free</option>
                       </select>
                   </div>
                   <div className="card-pro overflow-hidden border-none shadow-xl dark:bg-slate-900">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Identidade</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Saldo</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Plano</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Cadastro</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Controles</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {adminUsers
                            .filter(u => 
                              (u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase())) &&
                              (adminFilters.premium === "all" || (adminFilters.premium === "premium" ? u.isPremium : !u.isPremium)) &&
                              (adminFilters.loginType === "all" || u.loginType === adminFilters.loginType)
                            )
                            .map(u => (
                            <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-6 py-6">
                                <div className="flex items-center gap-3">
                                  <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}`} className="w-9 h-9 rounded-lg" />
                                  <div>
                                    <p className="text-sm font-bold dark:text-white flex items-center gap-2">
                                      {u.displayName}
                                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-black uppercase">
                                        {u.loginType || "google"}
                                      </span>
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-6">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold dark:text-slate-300">SC {u.balance || 0}</span>
                                </div>
                              </td>
                              <td className="px-6 py-6">
                                <span className={`status-badge ${u.isPremium ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-500'}`}>
                                  {u.isPremium ? "Premium" : "Free Member"}
                                </span>
                              </td>
                              <td className="px-6 py-6 text-[10px] font-mono text-slate-400 italic">
                                {new Date(u.createdAt?.seconds * 1000 || u.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => updateAdminUser(u.id, "balance", (u.balance || 0) + 10)}
                                    className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                    title="+10 Credits"
                                  >
                                    <TrendingUp className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => updateAdminUser(u.id, "balance", Math.max(0, (u.balance || 0) - 10))}
                                    className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                                    title="-10 Credits"
                                  >
                                    <TrendingDown className="w-4 h-4" />
                                  </button>
                                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-1" />
                                  <button 
                                    onClick={() => updateAdminUser(u.id, "premium", !u.isPremium)}
                                    className={`p-2 rounded-lg transition-all ${u.isPremium ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                                    title={u.isPremium ? "Downgrade" : "Make Premium"}
                                  >
                                    {u.isPremium ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-6">
                    <div className="card-pro p-8 dark:bg-slate-900 border-none">
                      <h3 className="font-display font-bold text-xl mb-6 dark:text-white">Injetar Tendência Crítica</h3>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const f = e.currentTarget;
                        const title = (f.elements.namedItem("title") as HTMLInputElement).value;
                        const resultVal = (f.elements.namedItem("result") as HTMLSelectElement).value;
                        try {
                          await addDoc(collection(db, "viral_trends"), {
                            title,
                            result: resultVal,
                            viralityScore: 90,
                            updatedAt: Timestamp.now()
                          });
                          f.reset();
                          fetchViralTrends();
                          alert("Tendência adicionada com sucesso!");
                        } catch (err) {
                          alert("Erro ao adicionar tendência");
                        }
                      }} className="flex flex-col md:flex-row gap-4">
                        <input 
                          name="title" 
                          placeholder="Título da notícia viral/boato..." 
                          className="flex-grow bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm dark:text-white focus:ring-2 ring-blue-500 transition-all" 
                          required 
                        />
                        <select 
                          name="result" 
                          className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm dark:text-white outline-none"
                        >
                          <option value="Falso">Falso</option>
                          <option value="Verdadeiro">Verdadeiro</option>
                          <option value="Manipulado">Manipulado</option>
                        </select>
                        <button type="submit" className="btn-primary">Adicionar ao Monitor</button>
                      </form>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {viralTrends.map((t, i) => (
                        <div key={i} className="card-pro p-6 dark:bg-slate-900 border-none flex justify-between items-center group animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div>
                             <p className="text-sm font-bold dark:text-white mb-1">{t.title}</p>
                             <div className="flex gap-2">
                               <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${t.result === 'Falso' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{t.result}</span>
                               <span className="text-[10px] text-slate-500 font-mono italic">Prioridade Máxima</span>
                             </div>
                          </div>
                          {/* Add delete button if needed */}
                        </div>
                      ))}
                    </div>
                 </div>
               )}
             </section>
          )}

          {view === "terms" && (
            <section className="space-y-12 max-w-4xl">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Termos de Uso</h3>
                <p className="text-slate-500 dark:text-slate-400 italic">Última atualização: Abril de 2026</p>
              </div>
              <div className="card-pro p-10 dark:bg-slate-900 border-none prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <p>O Sentinel AI é uma plataforma de verificação de integridade factual. Ao utilizar nossos serviços, você concorda que:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Uso Responsável:</strong> O usuário assume total responsabilidade pela interpretação dos resultados fornecidos.</li>
                  <li><strong>Limitações da IA:</strong> Embora utilizemos modelos avançados, a IA pode cometer erros. O Sentinel é uma ferramenta de auxílio, não uma autoridade absoluta.</li>
                  <li><strong>Privacidade:</strong> Dados enviados para verificação são processados anonimamente para melhorar o motor de detecção, conforme nossa Política de Privacidade.</li>
                  <li><strong>Direitos Autorais:</strong> Todo o motor de análise e algoritmos de scoring são propriedade exclusiva da Sentinel Systems.</li>
                </ul>
              </div>
            </section>
          )}

          {view === "privacy" && (
            <section className="space-y-12 max-w-4xl">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Política de Privacidade</h3>
                <p className="text-slate-500 dark:text-slate-400 italic">Compromisso Sentinel com a Segurança de Dados</p>
              </div>
              <div className="card-pro p-10 dark:bg-slate-900 border-none text-sm leading-relaxed text-slate-600 dark:text-slate-300 space-y-6">
                <p>Valorizamos sua privacidade acima de tudo. No Sentinel:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-2">
                      <h4 className="font-bold dark:text-white">O que coletamos?</h4>
                      <p className="text-xs">Identificadores básicos de login (email/nome) e o conteúdo que você submete para análise histórica pessoal.</p>
                   </div>
                   <div className="space-y-2">
                      <h4 className="font-bold dark:text-white">Como protegemos?</h4>
                      <p className="text-xs">Utilizamos criptografia de ponta a ponta e bases de dados isoladas via Firestore Security Rules.</p>
                   </div>
                </div>
                <p className="pt-4 border-t border-slate-100 dark:border-slate-800">Seus dados nunca são vendidos a terceiros. O conteúdo anônimo pode ser usado para indexar padrões de fake news em nossa base global.</p>
              </div>
            </section>
          )}

          {view === "api_docs" && (
            <section className="space-y-12">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Documentação da API</h3>
                <p className="text-slate-500 dark:text-slate-400">Implementação técnica para desenvolvedores e organizações.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-2 card-pro p-10 dark:bg-slate-900 border-none space-y-8">
                    <div className="space-y-2">
                       <h4 className="font-bold dark:text-white">Endpoint Principal</h4>
                       <code className="block p-4 bg-slate-950 text-blue-400 rounded-xl text-xs">POST https://api.sentinel.ai/v1/verify</code>
                    </div>
                    <div className="space-y-4">
                       <h4 className="font-bold dark:text-white">Exemplo de Requisição</h4>
                       <pre className="p-6 bg-slate-950 text-slate-400 rounded-2xl text-[10px] leading-relaxed">
{`{
  "content": "Notícia viral aqui...",
  "type": "text",
  "options": {
    "deep_analysis": true,
    "source_verification": true
  }
}`}
                       </pre>
                    </div>
                 </div>
                 <div className="space-y-6">
                    <div className="card-pro p-6 dark:bg-slate-800/50 border-none">
                       <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Autenticação</h5>
                       <p className="text-[10px] text-slate-500">Utilize o cabeçalho Bearer Token com sua chave gerada em 'API Pública'.</p>
                    </div>
                    <div className="card-pro p-6 dark:bg-slate-800/50 border-none">
                       <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Limites de Taxa</h5>
                       <p className="text-[10px] text-slate-500">Free: 10 req/dia. Premium: 1.000 req/min.</p>
                    </div>
                 </div>
              </div>
            </section>
          )}

          {view === "status" && (
            <section className="space-y-12">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Status do Motor Sentinel</h3>
                <p className="text-slate-500 dark:text-slate-400">Monitor de saúde dos sistemas de verificação em tempo real.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                   { name: "Análise IA (Core)", status: "Operacional", latency: "240ms" },
                   { name: "Fact-Check API", status: "Operacional", latency: "650ms" },
                   { name: "Hash Integrity", status: "Operacional", latency: "12ms" },
                   { name: "Media Processing", status: "Carga Alta", latency: "1.2s" }
                 ].map((s, i) => (
                   <div key={i} className="card-pro p-6 dark:bg-slate-900 border-none flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.name}</span>
                         <div className={`w-2 h-2 rounded-full ${s.status === 'Operacional' ? 'bg-emerald-500' : 'bg-amber-500 shadow-amber-500/50 shadow-lg'}`} />
                      </div>
                      <div className="flex items-baseline gap-2">
                         <span className="text-lg font-bold dark:text-white">{s.status}</span>
                         <span className="text-[10px] text-slate-500 font-mono">{s.latency}</span>
                      </div>
                   </div>
                 ))}
              </div>
              <div className="card-pro p-10 dark:bg-slate-900 border-none">
                 <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-8">Uptime Histórico - Últimos 30 Dias</h4>
                 <div className="flex gap-1 h-8 items-end">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} className="flex-grow bg-emerald-500/80 rounded-full h-full hover:bg-emerald-400 transition-all cursor-crosshair" title={`Dia ${30-i} atrás: 100%`} />
                    ))}
                 </div>
              </div>
            </section>
          )}

          {view === "profile" && (
            <section className="space-y-12">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Perfil do Agente</h3>
                <p className="text-slate-500 dark:text-slate-400">Informações e identidade no ecossistema Sentinel.</p>
              </div>
              <div className="max-w-xl card-pro p-10 dark:bg-slate-900 border-none text-center space-y-6">
                 <img src={user?.photoURL} className="w-24 h-24 rounded-3xl mx-auto shadow-2xl border-4 border-white dark:border-slate-800" />
                 <div className="space-y-1">
                    <h4 className="font-display font-bold text-xl dark:text-white">{user?.displayName}</h4>
                    <p className="text-sm text-slate-500">{user?.email}</p>
                 </div>
                 <div className="flex justify-center gap-2">
                    {user?.email === "andrewsantoss658@gmail.com" && (
                      <span className="status-badge bg-rose-600 text-white border-none shadow-lg shadow-rose-500/20"> Master Admin 🛡️ </span>
                    )}
                    <span className="status-badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{user?.isPremium ? "Assinante Premium" : "Agente Estagiário (Free)"}</span>
                    <span className="status-badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Score {user?.reputationScore || 100}</span>
                 </div>
                 <div className="pt-8 flex flex-col gap-3">
                    <button onClick={() => setView("dashboard")} className="btn-primary w-full">Voltar para o Painel</button>
                    <button onClick={handleLogout} className="text-xs font-bold text-rose-500 hover:underline uppercase tracking-widest">Encerrar Sessão</button>
                 </div>
              </div>
            </section>
          )}

          {view === "investigator" && (
             <section className="space-y-8">
               <div className="flex flex-col gap-4 text-center max-w-2xl mx-auto py-20">
                 <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-10 h-10 text-blue-600" />
                 </div>
                 <h2 className="font-display font-bold text-3xl dark:text-white">Modo Investigador Pro</h2>
                 <p className="text-slate-500 dark:text-slate-400 text-lg">Acesso direto a cruzamento de dados forenses, análise de metadados profunda e detecção de padrões neurais de desinformação.</p>
                 <div className="flex flex-col gap-4 items-center mt-8">
                    <button className="btn-primary py-4 px-12 text-base shadow-xl shadow-blue-500/20">Upgrade para Individual ($19/m)</button>
                    <div className="flex gap-4">
                      <button className="btn-secondary">Base de Conhecimento</button>
                      <button className="btn-secondary">Protocolos Ativos</button>
                    </div>
                 </div>
               </div>
             </section>
          )}

          {view === "support" && (
            <section className="space-y-12">
              <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Central de Suporte Sentinel</h3>
                <p className="text-slate-500 dark:text-slate-400">Encontre respostas rápidas ou fale com um de nossos especialistas.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-400">Principais Dúvidas (FAQ)</h4>
                  <div className="space-y-3">
                    {[
                      { q: "Como o Sentinel garante 100% de precisão?", a: "Nós utilizamos uma análise multi-camada: IA, verificação de fontes externas e hashing SHA-256 para garantir integridade factual crítica." },
                      { q: "O serviço é gratuito para sempre?", a: "Oferecemos uma carga gratuita diária. Usuários Premium desbloqueiam verificações ilimitadas e análise de vídeos/deepfakes." },
                      { q: "Como integrar a API do Sentinel em meu site?", a: "Você pode gerar uma chave API na aba 'API Pública'. Oferecemos SDKs para Node.js, Python e Go." },
                      { q: "O Sentinel analisa imagens privadas?", a: "A privacidade é nossa prioridade. Suas imagens são processadas em ambiente isolado e não são usadas para treinamento de IA pública." }
                    ].map((faq, i) => (
                      <div key={i} className="card-pro p-6 dark:bg-slate-900 border-none group cursor-pointer">
                        <p className="text-sm font-bold dark:text-white mb-2 group-hover:text-blue-600 transition-colors">{faq.q}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{faq.a}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Chat ao Vivo (Suporte em Tempo Real)</h4>
                  <div className="card-pro flex-grow dark:bg-slate-900 border-none flex flex-col h-[500px]">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-[10px] font-bold">SP</div>
                        <div>
                          <p className="text-xs font-bold dark:text-white">Assistente Sentinel</p>
                          <p className="text-[10px] text-emerald-500 font-bold">Online</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-grow p-6 space-y-4 overflow-y-auto custom-scrollbar">
                      <div className="flex gap-3 max-w-[80%]">
                        <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center shrink-0">
                          <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none">
                          <p className="text-xs text-slate-600 dark:text-slate-300">Olá! Como posso ajudar você a navegar pelo Sentinel hoje?</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                      <input type="text" placeholder="Escreva sua mensagem..." className="flex-grow bg-slate-50 dark:bg-slate-950 border-none rounded-xl px-4 py-2 text-xs outline-none dark:text-white" />
                      <button className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {view === "api" && (
            <section className="space-y-12">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Portal do Desenvolvedor</h3>
                <p className="text-slate-500 dark:text-slate-400">Construa ferramentas de integridade utilizando o motor do Sentinel.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="card-pro p-8 dark:bg-slate-900 border-none space-y-4">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-sm dark:text-white">Chaves de API</h4>
                    <p className="text-xs text-slate-500">Gerencie suas credenciais para acesso programático ao motor de análise.</p>
                    <button className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">Gerar Chave</button>
                 </div>
                 <div className="card-pro p-8 dark:bg-slate-900 border-none space-y-4">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-sm dark:text-white">Documentação</h4>
                    <p className="text-xs text-slate-500">Aprenda a integrar nossos endpoints Restful e Webhooks em seu fluxo.</p>
                    <button className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">Abrir Docs</button>
                 </div>
                 <div className="card-pro p-8 dark:bg-slate-900 border-none space-y-4">
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-600">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-sm dark:text-white">Uso e Quotas</h4>
                    <p className="text-xs text-slate-500">Monitore seu consumo de tokens e limites de requisição por segundo.</p>
                    <button className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">Ver Gráficos</button>
                 </div>
              </div>
            </section>
          )}

          {view === "settings" && (
            <section className="space-y-12">
               <div className="flex flex-col gap-2">
                <h3 className="font-display font-bold text-3xl dark:text-white">Configurações</h3>
                <p className="text-slate-500 dark:text-slate-400">Personalize sua experiência no ecossistema Sentinel.</p>
              </div>

              <div className="max-w-2xl space-y-6">
                <div className="card-pro p-8 dark:bg-slate-900 border-none space-y-8">
                   <div className="space-y-4">
                      <h4 className="text-sm font-bold dark:text-white">Preferências de Tema</h4>
                      <div className="flex bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl w-fit">
                        {[
                          { id: "light", label: "Claro", icon: CheckCircle2 },
                          { id: "dark", label: "Escuro", icon: Lock },
                          { id: "system", label: "Sistema", icon: Cpu }
                        ].map(t => (
                          <button 
                            key={t.id}
                            onClick={() => setTheme(t.id as Theme)}
                            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${theme === t.id ? "bg-white dark:bg-slate-800 text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                          >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                          </button>
                        ))}
                      </div>
                   </div>

                   <div className="space-y-4 pt-8 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-sm font-bold dark:text-white">Notificações</h4>
                      <p className="text-xs text-slate-500 mb-4">Receba alertas sobre boatos virais e atualizações de segurança.</p>
                      <div className="flex items-center justify-between">
                         <span className="text-xs font-medium dark:text-slate-300">Alertas de Viralidade Crítica</span>
                         <div className="w-10 h-5 bg-blue-600 rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full transition-all" /></div>
                      </div>
                   </div>

                   <div className="space-y-4 pt-8 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-sm font-bold text-rose-500">Zona de Perigo</h4>
                      <button className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest">Excluir todos os logs de histórico</button>
                   </div>
                </div>
              </div>
            </section>
          )}

        </div>

        <footer className="mt-20 py-12 px-8 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-8 bg-white dark:bg-slate-900 transition-colors">
          <div className="flex items-center gap-3">
             <SiteLogo className="w-8 h-8" />
             <p className="text-xs font-bold text-slate-500 dark:text-slate-400">&copy; {new Date().getFullYear()} Sentinel AI factual Integrity Platform</p>
          </div>
          <div className="flex gap-8">
             <button onClick={() => setView("terms")} className="text-xs font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Termos de Uso</button>
             <button onClick={() => setView("privacy")} className="text-xs font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Privacidade</button>
             <button onClick={() => setView("api_docs")} className="text-xs font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">API Docs</button>
             <button onClick={() => setView("status")} className="text-xs font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">Status do Motor</button>
          </div>
        </footer>
      </main>

      {/* Mobile Nav Overlay */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-10 z-[100]">
        <button onClick={() => setView("dashboard")} className={`p-2 rounded-xl ${view === 'dashboard' ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500'}`}><LayoutGrid className="w-6 h-6" /></button>
        <button onClick={() => setView("history")} className={`p-2 rounded-xl ${view === 'history' ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500'}`}><History className="w-6 h-6" /></button>
        <button onClick={() => setView("investigator")} className={`p-2 rounded-xl ${view === 'investigator' ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500'}`}><ShieldAlert className="w-6 h-6" /></button>
        <button 
          onClick={user ? () => setView("profile") : handleLogin} 
          className={`p-2 rounded-xl ${view === 'profile' ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500'}`}
        >
          {user ? (
            <img src={user.photoURL} className="w-6 h-6 rounded-lg border-2 border-slate-100 dark:border-slate-800" />
          ) : (
            <UserIcon className="w-6 h-6" />
          )}
        </button>
      </div>
      <AnimatePresence>
        {showAuthModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setShowAuthModal(false)}
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-8 md:p-12 space-y-8">
                <div className="text-center space-y-2">
                  <div className="mb-4">
                    <SiteLogo className="w-20 h-20 mx-auto" />
                  </div>
                  <h3 className="text-2xl font-display font-bold dark:text-white">
                    {authMethod === 'login' ? 'Bem-vindo de volta' : 'Faça parte do Sentinel'}
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {authMethod === 'login' ? 'Acesse sua conta para gerenciar verificações.' : 'Crie sua conta para salvar seu histórico e reputação.'}
                  </p>
                </div>

                <form onSubmit={handleManualAuth} className="space-y-4">
                  {authMethod === 'signup' && (
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Seu Nome Completo"
                        required
                        value={manualDisplayName}
                        onChange={(e) => setManualDisplayName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 ring-blue-500/20 transition-all dark:text-white"
                      />
                    </div>
                  )}

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 ring-blue-500/20 transition-all dark:text-white"
                    />
                  </div>

                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      placeholder="Sua senha secreta"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm outline-none focus:ring-2 ring-blue-500/20 transition-all dark:text-white"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={authLoading}
                    className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMethod === 'login' ? 'Entrar Agora' : 'Criar Conta')}
                  </button>
                </form>

                <div className="relative h-px bg-slate-100 dark:bg-slate-800 my-4">
                  <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-4 text-[10px] font-black tracking-widest text-slate-400 uppercase">Ou continue com</span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={handleGoogleLogin}
                    className="flex items-center justify-center gap-3 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-3 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </button>
                </div>

                <div className="text-center">
                  <button 
                    onClick={() => { setAuthMethod(authMethod === 'login' ? 'signup' : 'login'); resetAuthForm(); }}
                    className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    {authMethod === 'login' ? 'Não tem conta? Cadastre-se' : 'Já possui conta? Faça login'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
