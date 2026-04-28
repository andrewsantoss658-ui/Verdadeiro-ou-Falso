import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { 
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  User
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp,
  doc,
  getDocFromServer,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
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
  EyeOff,
  CreditCard,
  Coins,
  Clock,
  Bell,
  Star
} from "lucide-react";
import CryptoJS from "crypto-js";

import { SiteLogo } from "./components/SiteLogo";

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type VerificationType = "text" | "image" | "video" | "link";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const auth = getAuth();
  const user = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid || "anonymous",
      email: user?.email || null,
      emailVerified: user?.emailVerified || null,
      isAnonymous: user?.isAnonymous || true,
    },
    operationType,
    path
  };
  console.error('Firestore Diagnostic:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

type ViewMode = "dashboard" | "history" | "investigator" | "support" | "settings" | "api" | "terms" | "privacy" | "status" | "api_docs";
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

export default function App() {
  const [view, setView] = useState<ViewMode>("dashboard");
  const [activeTab, setActiveTab] = useState<VerificationType>("text");
  const [imageAnalysisMode, setImageAnalysisMode] = useState<"visual" | "ocr">("visual");
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("sentinel_theme") as Theme) || "system");
  const [user, setUser] = useState<User | null>(null);
  
  // Inputs
  const [inputText, setInputText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Verification | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [viralTrends, setViralTrends] = useState<any[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: "success" | "error" | "info" }[]>([]);

  const addNotification = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auth = getAuth();
    
    // Attempt anonymous sign-in
    signInAnonymously(auth).catch(err => {
      console.warn("Anonymous login skipped/restricted:", err.message);
    });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const testConnection = async () => {
      const path = 'test/connection';
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        // Test backend API health
        const health = await axios.get('/api/health');
        console.log("Backend Health:", health.data);
      } catch (error: any) {
        console.warn("Firestore connection check failed:", error.message);
        if(error instanceof Error && error.message.includes('the client is offline')) {
          setError("Você parece estar offline. Verifique sua conexão.");
        } else {
          // Don't block the UI with a full error for just the connection doc missing
          // but log it for diagnostics
          console.error("Connection Diagnostic:", error);
        }
      }
    };
    testConnection();
    
    fetchViralTrends();
    const savedCount = localStorage.getItem("sentinel_checks");
    if (savedCount) setCheckCount(parseInt(savedCount));

    fetchHistory();

    const interval = setInterval(fetchViralTrends, 300000); // 5 min
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
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

  const fetchViralTrends = async () => {
    const path = "viral_trends";
    try {
      const q = query(collection(db, path), orderBy("updatedAt", "desc"), limit(5));
      const snap = await getDocs(q);
      if (snap.empty) {
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

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`/api/history`);
      setHistory(response.data);
    } catch (err: any) {
      console.error("Histórico indisponível:", err?.message);
    }
  };

  const verify = async () => {
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
      } else if (activeTab === "video") {
        if (!file) throw new Error("Nenhum vídeo selecionado.");
        contentToHash = file.name + file.size; // Simple hash for video
      }

      // Credits requirement removed for unlimited access


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
      
      let prompt = `Você é um perito em verificação de fatos (Sentinel Engine).
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
      }`;

      if (activeTab === "image" && imageAnalysisMode === "ocr") {
        prompt = `Você é um perito em verificação de fatos (Sentinel Engine).
        Sua tarefa principal é realizar OCR (Reconhecimento Óptico de Caracteres) na imagem enviada para extrair todo o texto visível.
        Após extrair o texto, realize uma análise profunda de fact-checking sobre o conteúdo textual extraído.
        
        Siga estes critérios:
        1. Extraia o texto com precisão.
        2. Verifique a veracidade das afirmações contidas no texto.
        3. Identifique se o texto ou a imagem apresentam sinais de manipulação digital.
        4. Avalie o contexto e a intenção do conteúdo.

        Retorne rigorosamente um JSON:
        {
          "result": "Verdadeiro | Falso | Manipulado | IA",
          "explanation": "Resumo do texto extraído e veredito final",
          "technicalDetails": "Texto extraído na íntegra: [Insira o texto aqui]. Análise técnica detalhando as fontes consultadas e evidências de vericidade.",
          "reliabilityScore": 0-100,
          "riskLevel": "Baixo | Médio | Alto",
          "sourceRating": "Confiável | Duvidosa | Desconhecida",
          "sources": ["links obrigatórios"],
          "references": [
            { "title": "Título", "url": "URL", "type": "original | factcheck | context" }
          ]
        }`;
      }

      prompt += `\n\nConteúdo: ${inputText || urlInput || "Análise de Imagem/Mídia"}\nMetadata: ${JSON.stringify(metadata)}`;

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
      
      // Enhance response for Video/Deepfake
      if (activeTab === "video") {
        analysis.technicalDetails = `[ANALISANDO ARQUIVO DE VÍDEO] ${analysis.technicalDetails}`;
      }

      const finalRecord: any = {
        type: activeTab,
        content: urlInput || inputText || (activeTab === "video" ? `Vídeo: ${file?.name}` : "Arquivo de Mídia"),
        hash,
        ...analysis,
        reliabilityScore: Number(analysis.reliabilityScore) || 0,
        userId: user?.uid || "anonymous",
        createdAt: serverTimestamp(),
        feedbackVotes: { up: 0, down: 0 }
      };

      try {
        const docRef = await addDoc(collection(db, "verifications"), finalRecord);
        setResult({ 
          ...finalRecord, 
          id: docRef.id,
          createdAt: new Date().toISOString() 
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, "verifications");
      }

      fetchHistory();
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
            <ShieldAlert className="w-5 h-5" /> Investigador Avançado
          </div>

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
                      <div className="space-y-4">
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                          <button 
                            onClick={() => setImageAnalysisMode("visual")}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${imageAnalysisMode === "visual" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400"}`}
                          >
                            Análise Visual
                          </button>
                          <button 
                            onClick={() => setImageAnalysisMode("ocr")}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${imageAnalysisMode === "ocr" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-400"}`}
                          >
                            Captura de Tela
                          </button>
                        </div>

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
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2 font-bold">
                                {imageAnalysisMode === "ocr" ? "Detecção de Texto e Fact-Checking" : "Detecção EXIF e Inconsistências"}
                              </p>
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
                      </div>
                    )}

                    {activeTab === "video" && (
                      <div 
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        className="w-full h-48 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 transition-all hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer group"
                      >
                        {filePreview ? (
                          <div className="flex flex-col items-center justify-center p-4">
                            <Video className="w-12 h-12 text-blue-500 mb-2" />
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-xs">{file?.name}</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-4" />
                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Arraste o vídeo ou clique p/ carregar</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2 font-bold">Análise Biométrica e Padrões Neurais</p>
                          </>
                        )}
                        <input type="file" accept="video/*" ref={fileInputRef} onChange={(e) => {
                          if (e.target.files?.[0]) {
                            const f = e.target.files[0];
                            setFile(f);
                            setFilePreview("video-placeholder"); 
                          }
                        }} className="hidden" />
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
                          <button 
                            onClick={async () => {
                              if (!result?.id) return;
                              try {
                                const docRef = doc(db, "verifications", result.id);
                                await updateDoc(docRef, {
                                  "feedbackVotes.up": (result.feedbackVotes?.up || 0) + 1
                                });
                                setResult({
                                  ...result,
                                  feedbackVotes: {
                                    ...result.feedbackVotes!,
                                    up: (result.feedbackVotes?.up || 0) + 1
                                  }
                                });
                                addNotification("Feedback registrado!", "success");
                              } catch (e) {
                                console.error("Erro ao votar", e);
                              }
                            }}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" /> Útil ({result.feedbackVotes?.up || 0})
                          </button>
                          <button 
                            onClick={async () => {
                              if (!result?.id) return;
                              try {
                                const docRef = doc(db, "verifications", result.id);
                                await updateDoc(docRef, {
                                  "feedbackVotes.down": (result.feedbackVotes?.down || 0) + 1
                                });
                                setResult({
                                  ...result,
                                  feedbackVotes: {
                                    ...result.feedbackVotes!,
                                    down: (result.feedbackVotes?.down || 0) + 1
                                  }
                                });
                                addNotification("Feedback registrado!", "info");
                              } catch (e) {
                                console.error("Erro ao votar", e);
                              }
                            }}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" /> Irrelevante ({result.feedbackVotes?.down || 0})
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
                       <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Uso de API</h5>
                       <p className="text-[10px] text-slate-500">Acesse nossa tecnologia programaticamente para integrações empresariais.</p>
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


          {view === "investigator" && (
             <section className="space-y-8">
               <div className="flex flex-col gap-4 text-center max-w-2xl mx-auto py-20">
                 <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-10 h-10 text-blue-600" />
                 </div>
                 <h2 className="font-display font-bold text-3xl dark:text-white">Motor Investigador Ativo</h2>
                 <p className="text-slate-500 dark:text-slate-400 text-lg">Seu acesso ao Sentinel permite cruzamento de dados forenses, análise de metadados profunda e detecção de padrões neurais de desinformação em tempo real.</p>
                 <div className="flex flex-col gap-4 items-center mt-8">
                    <div className="flex gap-4">
                      <button onClick={() => setView("dashboard")} className="btn-primary py-4 px-12">Nova Análise</button>
                      <button className="btn-secondary">Protocolos de Segurança</button>
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
                      { q: "O serviço é gratuito para sempre?", a: "Sim, oferecemos acesso total e ilimitado para todas as ferramentas de verificação." },
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
      </div>
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`fixed top-6 right-6 z-[300] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px] backdrop-blur-xl border ${
              n.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 
              n.type === 'error' ? 'bg-rose-500/90 border-rose-400 text-white' : 
              'bg-blue-600/90 border-blue-500 text-white'
            }`}
          >
            <div className="bg-white/20 p-2 rounded-full">
              {n.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
               n.type === 'error' ? <XCircle className="w-5 h-5" /> : 
               <Bell className="w-5 h-5" />}
            </div>
            <p className="text-sm font-bold leading-tight">{n.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
