import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { domToPng } from 'modern-screenshot';
import { QRCodeSVG } from 'qrcode.react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, setDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

// --- AI Assistant ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "AIzaSyALxhcG2x7V49u_b_tvgHWjslrpzigmlYI" });

const AIAssistant = ({ records, settings }: { records: RecordData[], settings: Settings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
    { role: 'ai', text: 'မင်္ဂလာပါ! ကျွန်တော်က Jump Jump VPN ရဲ့ AI Assistant ပါ။ လူကြီးမင်းရဲ့ လုပ်ငန်းအချက်အလက်တွေကို အခြေခံပြီး ဘာများကူညီပေးရမလဲခင်ဗျာ?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    // Calculate business statistics for context
    const totalRevenue = records.reduce((sum, r) => {
      const morning = parseInt(r.morningOpening) || 0;
      const closing = parseInt(r.nightClosing) || 0;
      const added = parseInt(r.stockAdded) || 0;
      const sales = (morning + added) - closing;
      return sum + (sales * (parseInt(r.costPerPoint) || 0));
    }, 0);

    const totalExpenses = records.reduce((sum, r) => {
      return sum + r.expenses.reduce((eSum, e) => eSum + (parseInt(e.amount) || 0), 0);
    }, 0);

    const netProfit = totalRevenue - totalExpenses;
    const avgProfit = records.length > 0 ? netProfit / records.length : 0;

    // Prepare context from records
    const businessContext = `
      Business Summary:
      - Total Days Recorded: ${records.length}
      - Total Revenue: ${totalRevenue.toLocaleString()} Ks
      - Total Expenses: ${totalExpenses.toLocaleString()} Ks
      - Net Profit: ${netProfit.toLocaleString()} Ks
      - Average Profit/Day: ${avgProfit.toLocaleString()} Ks
      - Monthly Target: ${settings.monthlyTarget} Ks
      - Current Exchange Rate: ${settings.exchangeRate} Ks
      
      Recent Activity (Last 5 days):
      ${records.slice(0, 5).map(r => `Date: ${r.date}, Morning: ${r.morningOpening}, Added: ${r.stockAdded}, Night: ${r.nightClosing}, Expenses: ${r.expenses.length}`).join('\n')}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: userMsg,
        config: {
          systemInstruction: `You are "Jump Jump", a highly intelligent, professional, and friendly business partner for a VPN Agent in Myanmar. 
          You are NOT just an AI; you are a dedicated business advisor who knows every detail of this business.
          
          User's Business Data:
          ${businessContext}
          
          Guidelines:
          1. Speak naturally and warmly in Burmese (Unicode). Use polite particles like "ခင်ဗျာ" or "ပါရှင့်" as appropriate (default to professional male tone "ခင်ဗျာ").
          2. When asked about money, profits, or performance, use the provided data to give specific answers.
          3. If the user asks "How is my business doing?", analyze the profit vs target and give an encouraging, expert opinion.
          4. If they ask about expenses, summarize where the money is going.
          5. Be proactive. If you notice high expenses or low profit, suggest ways to improve.
          6. Always be helpful and act like a real person who cares about the success of "Jump Jump VPN".
          7. Use English for numbers and technical terms if it makes it clearer, but keep the conversation in Burmese.`,
        }
      });
      
      const aiText = response.text || "တောင်းပန်ပါတယ်၊ အခုလောလောဆယ် အဖြေမပေးနိုင်သေးပါဘူး။";
      setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Error: AI နဲ့ ချိတ်ဆက်ရာမှာ အခက်အခဲရှိနေပါတယ်။" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="glass-card w-80 sm:w-96 h-[500px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <h3 className="font-bold">AI Assistant</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white/50 dark:bg-black/50 text-gray-800 dark:text-gray-200 rounded-tl-none border border-white/20'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/50 dark:bg-black/50 p-3 rounded-2xl rounded-tl-none border border-white/20">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="မေးမြန်းလိုသည်များ ရိုက်ထည့်ပါ..."
              className="flex-1 glass-input text-sm"
            />
            <button 
              onClick={handleSend}
              disabled={loading}
              className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 group relative"
        >
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></div>
          <i className="fa-solid fa-robot text-xl"></i>
          <span className="absolute right-full mr-3 px-3 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            AI Assistant ကို မေးမြန်းပါ
          </span>
        </button>
      )}
    </div>
  );
};

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
  authDomain: "vpnagentappakira.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "vpnagentappakira",
  storageBucket: "vpnagentappakira.firebasestorage.app",
  messagingSenderId: "22692788556",
  appId: "1:22692788556:web:1234567890abcdef" // Placeholder, but often not strictly required for basic auth/firestore
};
let db: any = null;
let auth: any = null;
let provider: any = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
} catch (e) {
  console.warn("Firebase not configured, using localStorage fallback.");
}

// --- Types ---
interface Expense {
  id: string;
  desc: string;
  amount: string;
}

interface RecordData {
  id: string;
  date: string;
  morningOpening: string;
  stockAdded: string;
  nightClosing: string;
  costPerPoint: string;
  kbzPay: string;
  wavePay: string;
  ayaPay: string;
  kbzBank: string;
  yomaBank: string;
  cbBank: string;
  expenses: Expense[];
}

interface Settings {
  pin: string;
  monthlyTarget: string;
  stockAlert: string;
  exchangeRate: string;
  darkMode: boolean;
}

// --- Utils ---
const safeFloat = (val: any): number => {
  if (!val) return 0;
  const parsed = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

const formatNum = (val: number): string => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatBurmeseNumber = (num: number): string => {
  if (num <= 0) return '၀';
  
  const units = [
    { value: 100000, name: 'သိန်း' },
    { value: 10000, name: 'သောင်း' },
    { value: 1000, name: 'ထောင်' },
    { value: 100, name: 'ရာ' },
    { value: 10, name: 'ဆယ်' },
    { value: 1, name: '' }
  ];

  let result = '';
  let remaining = num;

  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      result += `${count}${unit.name}`;
      remaining %= unit.value;
    }
  }

  return result;
};

const calculateRecord = (r: RecordData) => {
  const morning = safeFloat(r.morningOpening);
  const added = safeFloat(r.stockAdded);
  const closing = safeFloat(r.nightClosing);
  const costPerPoint = safeFloat(r.costPerPoint);
  
  const soldPoints = r.nightClosing === '' ? 0 : (morning + added) - closing;
  const capitalCost = soldPoints * costPerPoint;
  
  const totalSales = safeFloat(r.kbzPay) + safeFloat(r.wavePay) + safeFloat(r.ayaPay);
  const bankDeposits = safeFloat(r.kbzBank) + safeFloat(r.yomaBank) + safeFloat(r.cbBank);
  
  const grossProfit = totalSales - capitalCost;
  const totalExpenses = r.expenses.reduce((sum, e) => sum + safeFloat(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;
  const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  return { soldPoints, capitalCost, totalSales, bankDeposits, grossProfit, totalExpenses, netProfit, margin };
};

// --- Custom Hooks ---
function useUndoRedo<T>(initialState: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialState);
  const [future, setFuture] = useState<T[]>([]);

  const set = (newState: T) => {
    setPast([...past, present]);
    setPresent(newState);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture([present, ...future]);
    setPresent(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast([...past, present]);
    setFuture(newFuture);
    setPresent(next);
  };

  return { state: present, set, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}

// --- Components ---
const Modal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "အတည်ပြုမည်", cancelText = "ပယ်ဖျက်မည်" }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all">
        <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{title}</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-white/20 dark:hover:bg-black/20 transition">
              {cancelText}
            </button>
          )}
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-md">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const SVGChart = ({ data }: { data: number[] }) => {
  if (!data || data.length === 0) return <div className="h-40 flex items-center justify-center text-gray-400">ဒေတာမရှိပါ</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min;
  const height = 160;
  const width = 600;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((val - min) / (range || 1)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 -10 ${width} ${height + 20}`} className="w-full h-40 drop-shadow-sm">
        <defs>
          <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polyline fill="url(#gradient)" points={`0,${height} ${points} ${width},${height}`} />
        <polyline fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
        {data.map((val, i) => {
          const x = (i / (data.length - 1 || 1)) * width;
          const y = height - ((val - min) / (range || 1)) * height;
          return <circle key={i} cx={x} cy={y} r="4" fill="#ffffff" stroke="#3b82f6" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [isLocked, setIsLocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  
  const [settings, setSettings] = useState<Settings>({ pin: '', monthlyTarget: '1000000', stockAlert: '5000', exchangeRate: '3500', darkMode: false });

  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Modal State
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} });

  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  // Auth Effect
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Data & Settings Sync Effect
  useEffect(() => {
    setIsSettingsLoaded(false);
    if (user && db) {
      // Load Settings
      const loadSettings = async () => {
        const docRef = doc(db, 'users', user.uid, 'settings', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as Settings);
        } else {
          // Merge local settings if available, otherwise default
          const localSettings = localStorage.getItem('vpn_settings');
          const initialSettings = localSettings ? JSON.parse(localSettings) : settings;
          await setDoc(docRef, initialSettings);
          setSettings(initialSettings);
        }
        setIsSettingsLoaded(true);
      };
      loadSettings();

      // Load Records
      const unsub = onSnapshot(collection(db, 'users', user.uid, 'records'), (snap) => {
        const data = snap.docs.map(doc => doc.data() as RecordData);
        setRecords(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        localStorage.setItem('vpn_records', JSON.stringify(data));
        setLoading(false);
      }, (err) => {
        console.error(err);
        setLoading(false);
      });
      return () => unsub();
    } else {
      // Fallback to localStorage
      const localSettings = localStorage.getItem('vpn_settings');
      if (localSettings) setSettings(JSON.parse(localSettings));
      const localData = localStorage.getItem('vpn_records');
      if (localData) setRecords(JSON.parse(localData));
      setLoading(false);
      setIsSettingsLoaded(true);
    }
  }, [user]);

  // Save Settings Effect
  useEffect(() => {
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    if (!isSettingsLoaded) return; // Prevent overwriting before load
    
    localStorage.setItem('vpn_settings', JSON.stringify(settings));
    
    if (user && db) {
      setDoc(doc(db, 'users', user.uid, 'settings', 'config'), settings).catch(console.error);
    }
  }, [settings, user, isSettingsLoaded]);

  useEffect(() => {
    if (isSettingsLoaded && !settings.pin) {
      setIsLocked(false);
    }
  }, [settings.pin, isSettingsLoaded]);

  const saveRecord = async (record: RecordData) => {
    const newRecords = [record, ...records.filter(r => r.id !== record.id)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRecords(newRecords);
    localStorage.setItem('vpn_records', JSON.stringify(newRecords));
    
    if (user && db) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'records', record.id), record);
      } catch (e) {
        console.error("Firebase save failed", e);
      }
    }
  };

  const deleteRecord = async (id: string) => {
    const newRecords = records.filter(r => r.id !== id);
    setRecords(newRecords);
    localStorage.setItem('vpn_records', JSON.stringify(newRecords));
    if (user && db) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'records', id));
      } catch (e) {
        console.error("Firebase delete failed", e);
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) {
      setModal({ isOpen: true, title: 'အမှား', message: 'Firebase ချိတ်ဆက်မှု မရှိပါ။', onConfirm: () => setModal(m=>({...m, isOpen:false})) });
      return;
    }
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error(error);
      setModal({ isOpen: true, title: 'အကောင့်ဝင်ခြင်း မအောင်မြင်ပါ', message: error.message, onConfirm: () => setModal(m=>({...m, isOpen:false})) });
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      setRecords([]);
      setIsLocked(true);
      setDrawerOpen(false);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === settings.pin) setIsLocked(false);
    else {
      setModal({
        isOpen: true,
        title: 'မှားယွင်းနေပါသည်',
        message: 'PIN နံပါတ် မှားယွင်းနေပါသည်။',
        onConfirm: () => setModal(m => ({ ...m, isOpen: false })),
        onCancel: () => {}
      });
      setPinInput('');
    }
  };

  const handleForgotPin = () => {
    setModal({
      isOpen: true,
      title: 'PIN ဖျက်မည်',
      message: 'PIN နံပါတ်ကို ဖျက်ပြီး အကောင့်ထွက်မည်။ Google ဖြင့် ပြန်လည်ဝင်ရောက်ပါ။',
      onConfirm: async () => {
        setModal(m => ({ ...m, isOpen: false }));
        if (user && db) {
          const newSettings = { ...settings, pin: '' };
          await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), newSettings);
          setSettings(newSettings);
        }
        setTimeout(() => {
          handleLogout();
        }, 100);
      },
      onCancel: () => setModal(m => ({ ...m, isOpen: false }))
    });
  };

  const exportCSV = () => {
    const headers = ['Date', 'Morning Opening', 'Stock Added', 'Night Closing', 'Cost Per Point', 'Sold Points', 'Capital Cost', 'KBZ Pay', 'Wave Pay', 'AYA Pay', 'Total Sales', 'KBZ Bank', 'Yoma Bank', 'CB Bank', 'Bank Deposits', 'Gross Profit', 'Total Expenses', 'Net Profit'];
    const rows = records.map(r => {
      const calc = calculateRecord(r);
      return [
        r.date, r.morningOpening, r.stockAdded, r.nightClosing, r.costPerPoint,
        calc.soldPoints, calc.capitalCost, r.kbzPay, r.wavePay, r.ayaPay, calc.totalSales,
        r.kbzBank, r.yomaBank, r.cbBank, calc.bankDeposits, calc.grossProfit, calc.totalExpenses, calc.netProfit
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vpn_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading || loading || (user && !isSettingsLoaded)) {
    return <div className="min-h-screen flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white text-gray-500"><i className="fa-solid fa-spinner fa-spin text-3xl"></i></div>;
  }

  if (!user && auth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-gray-900 dark:via-slate-900 dark:to-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-4">
        <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fa-brands fa-google text-3xl text-blue-600 dark:text-blue-400"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">အကောင့်ဝင်ပါ</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Data များကို အွန်လိုင်းတွင် လုံခြုံစွာ သိမ်းဆည်းရန် Google ဖြင့် ဝင်ပါ</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-3">
            <i className="fa-brands fa-google"></i> Google ဖြင့် ဝင်မည်
          </button>
        </div>
        <Modal {...modal} />
      </div>
    );
  }

  if (isLocked && settings.pin) {
    return (
      <div className="min-h-screen bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fa-solid fa-lock text-3xl text-blue-600 dark:text-blue-400"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">အက်ပ်ကို ဖွင့်ပါ</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">သင်၏ PIN နံပါတ်ကို ရိုက်ထည့်ပါ</p>
          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              maxLength={6}
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] p-4 border-2 border-white/40 dark:border-white/10 rounded-xl mb-6 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white text-gray-900 dark:text-white focus:border-blue-500 focus:ring-0 transition outline-none"
              autoFocus
            />
            <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30">
              ဝင်မည်
            </button>
          </form>
          <button type="button" onClick={handleForgotPin} className="w-full mt-4 py-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium transition cursor-pointer">
            PIN မေ့နေပါသလား? (Reset)
          </button>
        </div>
        <Modal {...modal} />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans transition-colors duration-200 relative overflow-x-hidden">
      {/* Decorative Orbs for Glassmorphism */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/20 dark:bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/20 dark:bg-indigo-600/20 blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-white/40 dark:border-white/10 px-4 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition border border-transparent hover:border-white/20">
            <i className="fa-solid fa-bars text-xl"></i>
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent hidden sm:block tracking-wide">
            VPN Agent Pro
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 px-4 py-1.5 rounded-full text-sm font-medium shadow-inner">
            <i className="fa-solid fa-dollar-sign text-green-500"></i>
            <span className="tracking-wider">{settings.exchangeRate} MMK</span>
          </div>
          <button onClick={() => setSettings(s => ({ ...s, darkMode: !s.darkMode }))} className="p-2 rounded-full hover:bg-white/60 dark:hover:bg-white/10 transition w-10 h-10 flex items-center justify-center border border-transparent hover:border-white/20 backdrop-blur-md">
            <i className={`fa-solid ${settings.darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-gray-600'}`}></i>
          </button>
        </div>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setDrawerOpen(false)}></div>
          <div className="relative w-80 bg-white/70 dark:bg-black/70 backdrop-blur-2xl h-full shadow-[20px_0_40px_rgba(0,0,0,0.1)] dark:shadow-[20px_0_40px_rgba(0,0,0,0.5)] border-r border-white/40 dark:border-white/10 flex flex-col transform transition-transform">
            <div className="p-6 border-b border-white/40 dark:border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold tracking-wide">မီနူး</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-full transition border border-transparent hover:border-white/20">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {[
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'ဒက်ရှ်ဘုတ်' },
                { id: 'entry', icon: 'fa-plus-circle', label: 'စာရင်းသွင်းမည်' },
                { id: 'history', icon: 'fa-receipt', label: 'မှတ်တမ်းများ' },
                { id: 'summary', icon: 'fa-chart-line', label: 'အနှစ်ချုပ်' },
                { id: 'profit-loss', icon: 'fa-scale-balanced', label: 'အရှုံး/အမြတ် ရှင်းတမ်း' },
                { id: 'deposits', icon: 'fa-building-columns', label: 'ဘဏ်သွင်းငွေများ' },
                { id: 'expenses', icon: 'fa-file-invoice-dollar', label: 'ကုန်ကျစရိတ်များ' },
                { id: 'voucher', icon: 'fa-file-invoice', label: 'ဘောက်ချာထုတ်ရန်' },
                { id: 'settings', icon: 'fa-gear', label: 'ဆက်တင်များ' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition ${activeTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold' : 'hover:bg-white/20 dark:hover:bg-black/20'}`}
                >
                  <i className={`fa-solid ${tab.icon} w-5 text-center`}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-white/40 dark:border-white/10 space-y-3">
              {deferredPrompt && (
                <button onClick={handleInstallPWA} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition font-medium">
                  <i className="fa-solid fa-download"></i>
                  App အဖြစ် Install လုပ်မည်
                </button>
              )}
              <button onClick={exportCSV} className="w-full flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/40 transition font-medium">
                <i className="fa-solid fa-file-csv"></i>
                CSV ထုတ်မည်
              </button>
              {user && (
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition font-medium">
                  <i className="fa-solid fa-right-from-bracket"></i>
                  အကောင့်ထွက်မည်
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="p-4 max-w-5xl mx-auto pb-24">
        {activeTab === 'dashboard' && <Dashboard records={records} settings={settings} />}
        {activeTab === 'entry' && <EntryForm records={records} onSave={(r) => { saveRecord(r); setActiveTab('history'); }} />}
        {activeTab === 'history' && <HistoryList records={records} onDelete={(id: string) => {
          setModal({
            isOpen: true,
            title: 'ဖျက်ရန် သေချာပါသလား?',
            message: 'ဤမှတ်တမ်းကို ဖျက်လိုက်ပါက ပြန်လည်ရယူ၍ မရနိုင်ပါ။',
            confirmText: 'ဖျက်မည်',
            onConfirm: () => { deleteRecord(id); setModal(m => ({ ...m, isOpen: false })); },
            onCancel: () => setModal(m => ({ ...m, isOpen: false }))
          });
        }} onEdit={(r: RecordData) => { /* Implement Edit */ }} />}
        {activeTab === 'summary' && <Summary records={records} />}
        {activeTab === 'profit-loss' && <ProfitLossStatement records={records} settings={settings} />}
        {activeTab === 'deposits' && <DepositsList records={records} />}
        {activeTab === 'expenses' && <ExpensesList records={records} />}
        {activeTab === 'voucher' && <VoucherGenerator />}
        {activeTab === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} user={user} />}
      </main>

      <AIAssistant records={records} settings={settings} />
      <Modal {...modal} />
    </div>
  );
}

// --- Sub Components ---

function Dashboard({ records, settings }: { records: RecordData[], settings: Settings }) {
  const today = new Date().toISOString().split('T')[0];
  const todayRecord = records.find(r => r.date === today);
  const calc = todayRecord ? calculateRecord(todayRecord) : null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthRecords = records.filter(r => r.date.startsWith(currentMonth));
  const monthProfit = monthRecords.reduce((sum, r) => sum + calculateRecord(r).netProfit, 0);
  const target = safeFloat(settings.monthlyTarget);
  const progress = target > 0 ? Math.min((monthProfit / target) * 100, 100) : 0;

  const last30Days = [...records].slice(0, 30).reverse();
  const chartData = last30Days.map(r => calculateRecord(r).netProfit);

  // AI Insight
  let insight = { type: 'info', icon: 'fa-lightbulb', text: 'ယနေ့အတွက် စာရင်းမသွင်းရသေးပါ။ ယမန်နေ့က စာရင်းများကို ပြန်လည်စစ်ဆေးနိုင်ပါသည်။', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' };
  
  const stockAlert = safeFloat(settings.stockAlert);
  const latestRecord = records.length > 0 ? records[0] : null;
  
  if (latestRecord) {
    const latestCalc = calculateRecord(latestRecord);
    const currentStock = safeFloat(latestRecord.nightClosing) || ((safeFloat(latestRecord.morningOpening) + safeFloat(latestRecord.stockAdded)));
    
    const last7Days = records.slice(0, 7);
    const avg7DaySales = last7Days.reduce((sum, r) => sum + calculateRecord(r).totalSales, 0) / (last7Days.length || 1);
    
    const remainingTarget = target - monthProfit;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const currentDay = new Date().getDate();
    const daysLeft = daysInMonth - currentDay + 1;
    const requiredDailyProfit = remainingTarget > 0 ? remainingTarget / daysLeft : 0;

    if (currentStock < stockAlert && currentStock > 0) {
      insight = { 
        type: 'danger', 
        icon: 'fa-triangle-exclamation', 
        text: `သတိပြုရန်: လက်ကျန်ပွိုင့် (${formatNum(currentStock)}) သာ ကျန်ရှိပါတော့သည်။ ပွိုင့်ထပ်ဖြည့်ရန် လိုအပ်နေပါသည်။`, 
        color: 'text-red-600', 
        bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
      };
    } else if (latestCalc.totalExpenses > latestCalc.grossProfit && latestCalc.totalExpenses > 0) {
      insight = { 
        type: 'warning', 
        icon: 'fa-circle-exclamation', 
        text: `သတိပြုရန်: ${latestRecord.date} ရက်နေ့တွင် ကုန်ကျစရိတ် (${formatNum(latestCalc.totalExpenses)}) သည် အကြမ်းဖျင်းအမြတ်ထက် များနေပါသည်။ စရိတ်လျှော့ချရန် စဉ်းစားပါ။`, 
        color: 'text-orange-600', 
        bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' 
      };
    } else if (latestCalc.totalSales > avg7DaySales * 1.2 && avg7DaySales > 0) {
      insight = { 
        type: 'success', 
        icon: 'fa-arrow-trend-up', 
        text: `ကောင်းမွန်သော တိုးတက်မှု: ${latestRecord.date} ရက်နေ့ အရောင်းသည် ပြီးခဲ့သော ၇ ရက် ပျမ်းမျှအရောင်းထက် ၂၀% ပိုများနေပါသည်။ ဆက်လက်ထိန်းသိမ်းပါ။`, 
        color: 'text-green-600', 
        bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
      };
    } else if (remainingTarget <= 0 && target > 0) {
      insight = { 
        type: 'success', 
        icon: 'fa-award', 
        text: `ဂုဏ်ယူပါသည်! ယခုလအတွက် ရည်မှန်းထားသော အမြတ်ငွေ Target ကို အောင်မြင်စွာ ပြည့်မီသွားပါပြီ။`, 
        color: 'text-green-600', 
        bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
      };
    } else if (remainingTarget > 0 && daysLeft > 0 && target > 0) {
      insight = { 
        type: 'info', 
        icon: 'fa-bullseye', 
        text: `လစဉ် Target ပြည့်မီရန် နောက်ထပ် ${daysLeft} ရက်အတွင်း တစ်ရက်လျှင် ပျမ်းမျှ အမြတ်ငွေ ${formatNum(requiredDailyProfit)} ကျပ် ရှာဖွေရန် လိုအပ်ပါသည်။`, 
        color: 'text-blue-600', 
        bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
      };
    } else {
      insight = { 
        type: 'info', 
        icon: 'fa-chart-line', 
        text: `လုပ်ငန်းလည်ပတ်မှု ပုံမှန်ရှိပါသည်။ ${latestRecord.date} တွင် အသားတင်အမြတ် ${formatNum(latestCalc.netProfit)} ကျပ် ရရှိခဲ့ပါသည်။`, 
        color: 'text-blue-600', 
        bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
      };
    }
  }

  // Best Day Comparison
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  
  const lastMonthRecords = records.filter(r => r.date.startsWith(lastMonth));
  
  const getBestDay = (recs: RecordData[]) => {
    if (recs.length === 0) return null;
    return recs.reduce((best, current) => {
      const currentSales = calculateRecord(current).totalSales;
      const bestSales = calculateRecord(best).totalSales;
      return currentSales > bestSales ? current : best;
    });
  };

  const bestThisMonth = getBestDay(monthRecords);
  const bestLastMonth = getBestDay(lastMonthRecords);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Insight Banner */}
      <div className={`p-4 rounded-2xl border flex items-start gap-4 ${insight.bg}`}>
        <div className={`mt-1 ${insight.color}`}>
          <i className={`fa-solid ${insight.icon} text-xl`}></i>
        </div>
        <div>
          <h3 className={`font-bold ${insight.color}`}>AI အကြံပြုချက်</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{insight.text}</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="ယနေ့ အသားတင်အမြတ်" value={calc ? calc.netProfit : 0} subValue={calc ? `~ ${(calc.netProfit / safeFloat(settings.exchangeRate)).toFixed(2)} USD` : ''} icon="fa-wallet" color="blue" />
        <StatCard title="ယနေ့ ရောင်းရငွေ" value={calc ? calc.totalSales : 0} icon="fa-money-bill-wave" color="green" />
        <StatCard title="ယနေ့ ဘဏ်သွင်းငွေ" value={calc ? calc.bankDeposits : 0} icon="fa-building-columns" color="purple" />
        <StatCard title="ယနေ့ ကုန်ကျစရိတ်" value={calc ? calc.totalExpenses : 0} icon="fa-file-invoice-dollar" color="red" />
      </div>

      {/* Target Progress */}
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-6 rounded-3xl shadow-sm border border-white/40 dark:border-white/10">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">လစဉ် အမြတ်ပစ်မှတ်</h3>
            <div className="text-2xl font-bold">{formatNum(monthProfit)} <span className="text-sm font-normal text-gray-400">/ {formatNum(target)}</span></div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{progress.toFixed(1)}%</span>
          </div>
        </div>
        <div className="h-4 bg-white/20 dark:bg-black/20 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      {/* Best Day Comparison */}
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-6 rounded-3xl shadow-sm border border-white/40 dark:border-white/10">
        <h3 className="text-lg font-bold mb-4">အကောင်းဆုံး ရောင်းရငွေ (Best Sales Day)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50">
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">ယခုလ ({currentMonth})</div>
            {bestThisMonth ? (
              <>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatNum(calculateRecord(bestThisMonth).totalSales)}</div>
                <div className="text-sm text-blue-500 mt-1">{bestThisMonth.date}</div>
              </>
            ) : (
              <div className="text-gray-500">မှတ်တမ်းမရှိပါ</div>
            )}
          </div>
          <div className="p-4 rounded-2xl bg-white/20 dark:bg-black/20 border border-white/40 dark:border-white/10">
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">ပြီးခဲ့သောလ ({lastMonth})</div>
            {bestLastMonth ? (
              <>
                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{formatNum(calculateRecord(bestLastMonth).totalSales)}</div>
                <div className="text-sm text-gray-500 mt-1">{bestLastMonth.date}</div>
              </>
            ) : (
              <div className="text-gray-500">မှတ်တမ်းမရှိပါ</div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-6 rounded-3xl shadow-sm border border-white/40 dark:border-white/10">
        <h3 className="text-lg font-bold mb-6">ရက် ၃၀ အမြတ်ငွေ အပြောင်းအလဲ</h3>
        <SVGChart data={chartData} />
      </div>
    </div>
  );
}

function StatCard({ title, value, subValue, icon, color }: any) {
  const colors: any = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
  };
  return (
    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/40 dark:border-white/10">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}>
        <i className={`fa-solid ${icon}`}></i>
      </div>
      <h4 className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium mb-1">{title}</h4>
      <div className="text-lg sm:text-xl font-bold truncate">{formatNum(value)}</div>
      {subValue && <div className="text-xs text-gray-400 mt-1">{subValue}</div>}
    </div>
  );
}

function EntryForm({ records, onSave }: { records: RecordData[], onSave: (r: RecordData) => void }) {
  const getInitialState = (): RecordData => {
    const today = new Date().toISOString().split('T')[0];
    const prev = records.length > 0 ? records[0] : null;
    return {
      id: Date.now().toString(),
      date: today,
      morningOpening: prev ? prev.nightClosing : '',
      stockAdded: '',
      nightClosing: '',
      costPerPoint: prev ? prev.costPerPoint : '',
      kbzPay: '', wavePay: '', ayaPay: '',
      kbzBank: '', yomaBank: '', cbBank: '',
      expenses: []
    };
  };

  const { state, set, undo, redo, canUndo, canRedo } = useUndoRedo<RecordData>(getInitialState());

  const handleChange = (field: keyof RecordData, value: any) => {
    set({ ...state, [field]: value });
  };

  const handleExpenseChange = (index: number, field: keyof Expense, value: string) => {
    const newExp = [...state.expenses];
    newExp[index] = { ...newExp[index], [field]: value };
    set({ ...state, expenses: newExp });
  };

  const addExpense = () => {
    set({ ...state, expenses: [...state.expenses, { id: Date.now().toString(), desc: '', amount: '' }] });
  };

  const removeExpense = (index: number) => {
    set({ ...state, expenses: state.expenses.filter((_, i) => i !== index) });
  };

  const calc = calculateRecord(state);

  return (
    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl rounded-3xl shadow-lg border border-white/40 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      <div className="p-4 sm:p-6 border-b border-white/40 dark:border-white/10 flex justify-between items-center bg-white/30 dark:bg-black/30 backdrop-blur-md">
        <h2 className="text-xl font-bold">စာရင်းအသစ်သွင်းမည်</h2>
        <div className="flex gap-2">
          <button onClick={undo} disabled={!canUndo} className="p-2 rounded-lg bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-sm border border-white/40 dark:border-white/10 disabled:opacity-50 hover:bg-white/20 dark:hover:bg-black/20 transition"><i className="fa-solid fa-rotate-left"></i></button>
          <button onClick={redo} disabled={!canRedo} className="p-2 rounded-lg bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-sm border border-white/40 dark:border-white/10 disabled:opacity-50 hover:bg-white/20 dark:hover:bg-black/20 transition"><i className="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-8">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ရက်စွဲ</label>
          <input type="date" value={state.date} onChange={e => handleChange('date', e.target.value)} className="w-full p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
        </div>

        {/* Points */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputGroup label="မနက်အဖွင့် ပွိုင့်" value={state.morningOpening} onChange={(v: string) => handleChange('morningOpening', v)} icon="fa-sun" />
          <InputGroup label="ယနေ့ထပ်ဝယ် ပွိုင့်" value={state.stockAdded} onChange={(v: string) => handleChange('stockAdded', v)} icon="fa-plus" />
          <InputGroup label="ညအပိတ် ပွိုင့်" value={state.nightClosing} onChange={(v: string) => handleChange('nightClosing', v)} icon="fa-moon" required />
          <InputGroup label="ပွိုင့်ဈေးနှုန်း" value={state.costPerPoint} onChange={(v: string) => handleChange('costPerPoint', v)} icon="fa-tag" />
        </div>

        {/* Sales */}
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-wallet text-green-500"></i> ရောင်းရငွေများ (Sales)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputGroup label="KBZ Pay" value={state.kbzPay} onChange={(v: string) => handleChange('kbzPay', v)} />
            <InputGroup label="Wave Pay" value={state.wavePay} onChange={(v: string) => handleChange('wavePay', v)} />
            <InputGroup label="AYA Pay" value={state.ayaPay} onChange={(v: string) => handleChange('ayaPay', v)} />
          </div>
        </div>

        {/* Bank Deposits */}
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-building-columns text-purple-500"></i> ဘဏ်သွင်းငွေများ (Cash Out)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputGroup label="KBZ Bank" value={state.kbzBank} onChange={(v: string) => handleChange('kbzBank', v)} />
            <InputGroup label="Yoma Bank" value={state.yomaBank} onChange={(v: string) => handleChange('yomaBank', v)} />
            <InputGroup label="CB Bank" value={state.cbBank} onChange={(v: string) => handleChange('cbBank', v)} />
          </div>
        </div>

        {/* Expenses */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><i className="fa-solid fa-file-invoice-dollar text-red-500"></i> ကုန်ကျစရိတ်များ</h3>
            <button onClick={addExpense} className="text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition font-medium">
              <i className="fa-solid fa-plus mr-1"></i> အသစ်ထည့်မည်
            </button>
          </div>
          <datalist id="expense-desc">
            <option value="ဖုန်းဘေလ်" />
            <option value="မီးဖိုး" />
            <option value="အင်တာနက်" />
            <option value="ကြော်ငြာခ" />
          </datalist>
          <div className="space-y-3">
            {state.expenses.map((exp, i) => (
              <div key={exp.id} className="flex gap-2 items-start">
                <input list="expense-desc" placeholder="အကြောင်းအရာ" value={exp.desc} onChange={e => handleExpenseChange(i, 'desc', e.target.value)} className="flex-1 p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="number" placeholder="ပမာဏ" value={exp.amount} onChange={e => handleExpenseChange(i, 'amount', e.target.value)} className="w-1/3 p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                <button onClick={() => removeExpense(i)} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition"><i className="fa-solid fa-trash"></i></button>
              </div>
            ))}
            {state.expenses.length === 0 && <div className="text-center py-6 text-gray-400 border-2 border-dashed border-white/40 dark:border-white/10 rounded-xl">ကုန်ကျစရိတ် မရှိပါ</div>}
          </div>
        </div>
      </div>

      {/* Live Preview & Submit */}
      <div className="bg-white/30 dark:bg-black/30 backdrop-blur-md p-4 sm:p-6 border-t border-white/40 dark:border-white/10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">ခန့်မှန်း အသားတင်အမြတ်</div>
            <div className={`text-3xl font-bold ${calc.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatNum(calc.netProfit)} <span className="text-sm font-normal text-gray-500">MMK</span>
            </div>
          </div>
          {!state.nightClosing && (
            <div className="text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation"></i> ညအပိတ်ပွိုင့် ထည့်ရန်လိုပါသည်
            </div>
          )}
        </div>
        <button 
          onClick={() => onSave(state)}
          disabled={!state.nightClosing}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30 disabled:shadow-none"
        >
          သိမ်းဆည်းမည်
        </button>
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, icon, required }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><i className={`fa-solid ${icon}`}></i></div>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full p-3 ${icon ? 'pl-10' : ''} rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition`}
          placeholder="0"
        />
      </div>
    </div>
  );
}

function HistoryList({ records, onDelete, onEdit }: any) {
  if (records.length === 0) return <div className="text-center py-20 text-gray-500">မှတ်တမ်းများ မရှိသေးပါ။</div>;
  return (
    <div className="space-y-6">
      {records.map((r: RecordData) => <ReceiptCard key={r.id} record={r} onDelete={() => onDelete(r.id)} onEdit={() => onEdit(r)} />)}
    </div>
  );
}

function ReceiptCard({ record, onDelete, onEdit }: any) {
  const calc = calculateRecord(record);
  return (
    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl rounded-3xl shadow-lg border border-white/40 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      {/* Receipt Header */}
      <div className="bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white/50 p-4 border-b border-white/40 dark:border-white/10 flex justify-between items-center border-dashed">
        <div className="font-mono font-bold text-lg">{record.date}</div>
        <div className="flex gap-2">
          <button onClick={onDelete} className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-100 transition"><i className="fa-solid fa-trash text-sm"></i></button>
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Points Breakdown */}
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-gray-500">မနက်အဖွင့်</div><div className="text-right font-mono">{formatNum(safeFloat(record.morningOpening))}</div>
          <div className="text-gray-500">ထပ်ဝယ်</div><div className="text-right font-mono">+ {formatNum(safeFloat(record.stockAdded))}</div>
          <div className="text-gray-500">ညအပိတ်</div><div className="text-right font-mono">- {formatNum(safeFloat(record.nightClosing))}</div>
          <div className="col-span-2 border-t border-white/40 dark:border-white/10 my-1"></div>
          <div className="font-bold">ရောင်းရပွိုင့်</div><div className="text-right font-mono font-bold">{formatNum(calc.soldPoints)}</div>
          <div className="text-gray-500">အရင်းငွေ (@{formatNum(safeFloat(record.costPerPoint))})</div><div className="text-right font-mono text-red-500">- {formatNum(calc.capitalCost)}</div>
        </div>

        {/* Sales */}
        <div className="bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white/30 rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sales</div>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <div className="text-gray-500">KBZ Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.kbzPay))}</div>
            <div className="text-gray-500">Wave Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.wavePay))}</div>
            <div className="text-gray-500">AYA Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.ayaPay))}</div>
            <div className="col-span-2 border-t border-white/40 dark:border-white/10 my-1"></div>
            <div className="font-bold text-green-600">Total Sales</div><div className="text-right font-mono font-bold text-green-600">{formatNum(calc.totalSales)}</div>
          </div>
        </div>

        {/* Expenses */}
        {record.expenses.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Expenses</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              {record.expenses.map((e: Expense) => (
                <React.Fragment key={e.id}>
                  <div className="text-gray-500">{e.desc}</div><div className="text-right font-mono text-red-500">- {formatNum(safeFloat(e.amount))}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Net Profit */}
        <div className="border-t-2 border-dashed border-white/40 dark:border-white/10 pt-4 flex justify-between items-end">
          <div>
            <div className="text-sm text-gray-500 mb-1">အသားတင်အမြတ်</div>
            <div className="text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 px-2 py-1 rounded">Margin: {calc.margin.toFixed(1)}%</div>
          </div>
          <div className={`text-2xl font-bold font-mono ${calc.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatNum(calc.netProfit)}
          </div>
        </div>

        {/* Bank Deposits (Isolated) */}
        {calc.bankDeposits > 0 && (
          <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 rounded-xl p-4">
            <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <i className="fa-solid fa-building-columns"></i> Bank Deposits (Cash Out)
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              {safeFloat(record.kbzBank) > 0 && <><div className="text-purple-700/70 dark:text-purple-300/70">KBZ Bank</div><div className="text-right font-mono text-purple-700 dark:text-purple-300">{formatNum(safeFloat(record.kbzBank))}</div></>}
              {safeFloat(record.yomaBank) > 0 && <><div className="text-purple-700/70 dark:text-purple-300/70">Yoma Bank</div><div className="text-right font-mono text-purple-700 dark:text-purple-300">{formatNum(safeFloat(record.yomaBank))}</div></>}
              {safeFloat(record.cbBank) > 0 && <><div className="text-purple-700/70 dark:text-purple-300/70">CB Bank</div><div className="text-right font-mono text-purple-700 dark:text-purple-300">{formatNum(safeFloat(record.cbBank))}</div></>}
              <div className="col-span-2 border-t border-purple-200 dark:border-purple-800/50 my-1"></div>
              <div className="font-bold text-purple-700 dark:text-purple-400">Total Deposited</div><div className="text-right font-mono font-bold text-purple-700 dark:text-purple-400">{formatNum(calc.bankDeposits)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ records }: { records: RecordData[] }) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(d.setDate(diff)).toISOString().split('T')[0];

  const todayRecords = records.filter(r => r.date === today);
  const weekRecords = records.filter(r => r.date >= startOfWeek && r.date <= today);
  const monthRecords = records.filter(r => r.date.startsWith(currentMonth));
  const yearRecords = records.filter(r => r.date.startsWith(currentYear));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <h2 className="text-2xl font-bold mb-4">အနှစ်ချုပ် (Summary)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard title="ယနေ့ (Today)" records={todayRecords} />
        <SummaryCard title="ယခုအပတ် (This Week)" records={weekRecords} />
        <SummaryCard title="ယခုလ (This Month)" records={monthRecords} />
        <SummaryCard title="ယခုနှစ် (This Year)" records={yearRecords} />
      </div>
    </div>
  );
}

function SummaryCard({ title, records }: { title: string, records: RecordData[] }) {
  const totalSales = records.reduce((sum, r) => sum + calculateRecord(r).totalSales, 0);
  const totalExpenses = records.reduce((sum, r) => sum + calculateRecord(r).totalExpenses, 0);
  const netProfit = records.reduce((sum, r) => sum + calculateRecord(r).netProfit, 0);
  const bankDeposits = records.reduce((sum, r) => sum + calculateRecord(r).bankDeposits, 0);

  return (
    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-6 rounded-3xl shadow-sm border border-white/40 dark:border-white/10">
      <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">{title}</h3>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-500">ရောင်းရငွေ</span>
          <span className="font-mono text-blue-600">{formatNum(totalSales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">ကုန်ကျစရိတ်</span>
          <span className="font-mono text-red-500">- {formatNum(totalExpenses)}</span>
        </div>
        <div className="flex justify-between border-t border-white/40 dark:border-white/10 pt-2">
          <span className="font-medium">အသားတင်အမြတ်</span>
          <span className={`font-mono font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatNum(netProfit)}
          </span>
        </div>
        <div className="flex justify-between border-t border-white/40 dark:border-white/10 pt-2 mt-2">
          <span className="text-gray-500">ဘဏ်သွင်းငွေ</span>
          <span className="font-mono text-purple-600">{formatNum(bankDeposits)}</span>
        </div>
      </div>
    </div>
  );
}

function DepositsList({ records }: { records: RecordData[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const deposits = records.flatMap(r => {
    const d = [];
    if (safeFloat(r.kbzBank) > 0) d.push({ date: r.date, bank: 'KBZ Bank', amount: safeFloat(r.kbzBank) });
    if (safeFloat(r.yomaBank) > 0) d.push({ date: r.date, bank: 'Yoma Bank', amount: safeFloat(r.yomaBank) });
    if (safeFloat(r.cbBank) > 0) d.push({ date: r.date, bank: 'CB Bank', amount: safeFloat(r.cbBank) });
    return d;
  }).filter(d => {
    if (searchTerm && !d.bank.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (startDate && d.date < startDate) return false;
    if (endDate && d.date > endDate) return false;
    return true;
  });

  const total = deposits.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold">ဘဏ်သွင်းငွေများ</h2>
      </div>

      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-4 rounded-2xl shadow-sm border border-white/40 dark:border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input 
            type="text" 
            placeholder="ဘဏ်အမည် ရှာရန်..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
          />
        </div>
        <input 
          type="date" 
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
        />
        <input 
          type="date" 
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
        />
      </div>
      
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl shadow-sm border border-white/40 dark:border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white/50 flex justify-between font-bold">
          <span>စုစုပေါင်း</span>
          <span className="text-purple-600">{formatNum(total)}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {deposits.length === 0 ? (
            <div className="p-8 text-center text-gray-500">မှတ်တမ်းမရှိပါ</div>
          ) : (
            deposits.map((d, i) => (
              <div key={i} className="p-4 flex justify-between items-center hover:bg-white/20 dark:hover:bg-black/20 transition">
                <div>
                  <div className="font-medium">{d.bank}</div>
                  <div className="text-sm text-gray-500">{d.date}</div>
                </div>
                <div className="font-mono font-bold text-purple-600">{formatNum(d.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ExpensesList({ records }: { records: RecordData[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const expenses = records.flatMap(r => 
    r.expenses.map(e => ({ date: r.date, desc: e.desc, amount: safeFloat(e.amount) }))
  ).filter(e => {
    if (searchTerm && !e.desc.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    return true;
  });

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold">ကုန်ကျစရိတ်များ</h2>
      </div>

      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-4 rounded-2xl shadow-sm border border-white/40 dark:border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input 
            type="text" 
            placeholder="အကြောင်းအရာ ရှာရန်..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
          />
        </div>
        <input 
          type="date" 
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
        />
        <input 
          type="date" 
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white outline-none"
        />
      </div>
      
      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl shadow-sm border border-white/40 dark:border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white/50 flex justify-between font-bold">
          <span>စုစုပေါင်း</span>
          <span className="text-red-600">{formatNum(total)}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">မှတ်တမ်းမရှိပါ</div>
          ) : (
            expenses.map((e, i) => (
              <div key={i} className="p-4 flex justify-between items-center hover:bg-white/20 dark:hover:bg-black/20 transition">
                <div>
                  <div className="font-medium">{e.desc}</div>
                  <div className="text-sm text-gray-500">{e.date}</div>
                </div>
                <div className="font-mono font-bold text-red-500">{formatNum(e.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ProfitLossStatement({ records, settings }: { records: RecordData[], settings: Settings }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const monthRecords = records.filter(r => r.date.startsWith(selectedMonth));
  
  const totalSales = monthRecords.reduce((sum, r) => sum + calculateRecord(r).totalSales, 0);
  const totalCapital = monthRecords.reduce((sum, r) => sum + calculateRecord(r).capitalCost, 0);
  const totalExpenses = monthRecords.reduce((sum, r) => sum + calculateRecord(r).totalExpenses, 0);
  
  const grossProfit = totalSales - totalCapital;
  const netProfit = grossProfit - totalExpenses;

  const monthlyTarget = safeFloat(settings.monthlyTarget);
  const remainingTarget = monthlyTarget - netProfit;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">အရှုံး/အမြတ် ရှင်းတမ်း</h2>
        <input 
          type="month" 
          value={selectedMonth} 
          onChange={e => setSelectedMonth(e.target.value)} 
          className="p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 outline-none"
        />
      </div>

      <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl rounded-3xl shadow-lg border border-white/40 dark:border-white/10 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/50">
            <div className="text-blue-600 dark:text-blue-400 text-sm font-bold mb-1">စုစုပေါင်း ရောင်းရငွေ</div>
            <div className="text-2xl font-mono font-bold text-blue-700 dark:text-blue-300">{formatNum(totalSales)}</div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/50">
            <div className="text-orange-600 dark:text-orange-400 text-sm font-bold mb-1">အရင်းငွေ (Capital)</div>
            <div className="text-2xl font-mono font-bold text-orange-700 dark:text-orange-300">- {formatNum(totalCapital)}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800/50">
            <div className="text-red-600 dark:text-red-400 text-sm font-bold mb-1">အထွေထွေ ကုန်ကျစရိတ်</div>
            <div className="text-2xl font-mono font-bold text-red-700 dark:text-red-300">- {formatNum(totalExpenses)}</div>
          </div>
        </div>

        <div className="border-t-2 border-dashed border-white/40 dark:border-white/10 pt-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-gray-500 font-medium mb-2 uppercase tracking-widest text-sm">အသားတင် အမြတ် (Net Profit)</div>
            <div className={`text-5xl font-mono font-black ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatNum(netProfit)}
            </div>
            {totalSales > 0 && (
              <div className="mt-3 text-sm font-medium bg-white/20 dark:bg-black/20 px-3 py-1 rounded-full text-gray-600 dark:text-gray-400">
                Profit Margin: {((netProfit / totalSales) * 100).toFixed(1)}%
              </div>
            )}
            
            {monthlyTarget > 0 && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 w-full max-w-md">
                <div className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-2">လစဉ် Target: {formatNum(monthlyTarget)}</div>
                {remainingTarget > 0 ? (
                  <div className="text-gray-700 dark:text-gray-300">
                    ဒီလ Target ထိဖို့ <span className="font-bold text-blue-600 dark:text-blue-400">{formatBurmeseNumber(remainingTarget)}</span> လိုသေးတယ်
                  </div>
                ) : (
                  <div className="text-green-600 dark:text-green-400 font-bold">
                    <i className="fa-solid fa-party-horn mr-2"></i> ဂုဏ်ယူပါတယ်! ဒီလ Target ပြည့်သွားပါပြီ။
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, setSettings, user }: any) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleChange = (field: string, value: any) => {
    setLocalSettings({ ...localSettings, [field]: value });
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSettings(localSettings);
    if (user && db) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), localSettings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (error) {
        console.error("Error saving settings:", error);
      }
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl rounded-3xl shadow-lg border border-white/40 dark:border-white/10 p-6 space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-bold mb-6">ဆက်တင်များ</h2>
      
      {user && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-center gap-4 border border-blue-100 dark:border-blue-800/50">
          <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="Profile" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
          <div>
            <div className="text-sm text-blue-600 dark:text-blue-400 font-bold">အကောင့်ဝင်ထားပါသည်</div>
            <div className="text-gray-700 dark:text-gray-300">{user.email}</div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">App PIN (ဂဏန်း ၄ လုံး သို့ ၆ လုံး)</label>
        <input type="password" value={localSettings.pin} onChange={e => handleChange('pin', e.target.value)} className="w-full p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="PIN မထားလိုပါက အလွတ်ထားပါ" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">လစဉ် အမြတ်ပစ်မှတ် (Target)</label>
        <input type="number" value={localSettings.monthlyTarget} onChange={e => handleChange('monthlyTarget', e.target.value)} className="w-full p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">လက်ကျန်ပွိုင့် သတိပေးချက် (Stock Alert)</label>
        <input type="number" value={localSettings.stockAlert} onChange={e => handleChange('stockAlert', e.target.value)} className="w-full p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ဒေါ်လာ ငွေလဲနှုန်း (Exchange Rate)</label>
        <input type="number" value={localSettings.exchangeRate} onChange={e => handleChange('exchangeRate', e.target.value)} className="w-full p-3 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/40 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div className="pt-4">
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isSaving ? (
            <><i className="fa-solid fa-spinner fa-spin"></i> သိမ်းဆည်းနေပါသည်...</>
          ) : saveSuccess ? (
            <><i className="fa-solid fa-check"></i> အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ</>
          ) : (
            <><i className="fa-solid fa-save"></i> သိမ်းဆည်းမည်</>
          )}
        </button>
      </div>
    </div>
  );
}

function VoucherGenerator() {
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState([{ email: '', plan: '1 Device (1 Month) - 13000 Ks', qty: 1 }]);
  const [paymentMethod, setPaymentMethod] = useState('KBZ PAY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [discount, setDiscount] = useState<number | ''>('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  const voucherRef = useRef<HTMLDivElement>(null);

  const plans = [
    { name: '1 Device (3 Days)', price: '2700 Ks' },
    { name: '1 Device (1 Month)', price: '13000 Ks' },
    { name: '1 Device (2 Months)', price: '25000 Ks' },
    { name: '1 Device (3 Months)', price: '37500 Ks' },
    { name: '1 Device (4 Months)', price: '50000 Ks' },
    { name: '1 Device (5 Months)', price: '62500 Ks' },
    { name: '1 Device (6 Months)', price: '75000 Ks' },
    { name: '2 Device (1 Month)', price: '18000 Ks' },
    { name: '2 Device (2 Months)', price: '35000 Ks' },
    { name: '2 Device (3 Months)', price: '52500 Ks' },
    { name: '2 Device (6 Months)', price: '90000 Ks' },
    { name: '2 Device (12 Months)', price: '108000 Ks' }
  ];

  const paymentMethods = ['KBZ PAY', 'Wave Money', 'AYA Pay', 'MMQR'];

  const addItem = () => {
    setItems([...items, { email: '', plan: '1 Device (1 Month) - 13000 Ks', qty: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value as never };
    setItems(newItems);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 200;
          const MAX_HEIGHT = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setLogoUrl(canvas.toDataURL('image/png'));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const subtotal = items.reduce((sum, item) => {
    const priceStr = item.plan.split(' - ')[1];
    const price = parseInt(priceStr.replace(/[^0-9]/g, '')) || 0;
    return sum + (price * item.qty);
  }, 0);
  
  const totalAmount = subtotal - (Number(discount) || 0);

  const qrData = JSON.stringify({
    N: customerName,
    D: date,
    I: items.map(i => `${i.qty}x ${i.plan.split(' - ')[0]}`),
    S: subtotal,
    Disc: Number(discount) || 0,
    T: totalAmount,
    P: paymentMethod
  });

  const handleDownload = async () => {
    if (voucherRef.current) {
      try {
        const element = voucherRef.current;
        
        // Use modern-screenshot which supports modern CSS like oklch and backdrop-filter
        const dataUrl = await domToPng(element, {
          scale: 3,
          backgroundColor: '#ffffff',
          quality: 1,
        });

        const link = document.createElement('a');
        link.download = `Voucher_${customerName || 'Customer'}_${date}.png`;
        link.href = dataUrl;
        link.click();
      } catch (error) {
        console.error('Error generating voucher image:', error);
        alert('ဘောက်ချာထုတ်ရာတွင် အမှားအယွင်းဖြစ်ပေါ်ခဲ့ပါသည်။');
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <h2 className="text-2xl font-bold">ဘောက်ချာထုတ်ရန်</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Section */}
        <div className="glass-card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Customer Telegram Name</label>
            <input 
              type="text" 
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)} 
              className="w-full glass-input" 
              placeholder="e.g. John Doe"
            />
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">အကောင့်နှင့် ပလန်များ</label>
              <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <i className="fa-solid fa-plus"></i> အကောင့်ထပ်ထည့်မည်
              </button>
            </div>
            
            {items.map((item, index) => (
              <div key={index} className="p-4 rounded-xl border border-white/40 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur-md space-y-3 relative">
                {items.length > 1 && (
                  <button 
                    onClick={() => removeItem(index)} 
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition"
                  >
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                )}
                
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Gmail (အကောင့် {index + 1})</label>
                  <input 
                    type="email" 
                    value={item.email} 
                    onChange={e => updateItem(index, 'email', e.target.value)} 
                    className="w-full glass-input text-sm" 
                    placeholder="e.g. user@gmail.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Plan ရွေးချယ်ရန်</label>
                    <select 
                      value={item.plan} 
                      onChange={e => updateItem(index, 'plan', e.target.value)} 
                      className="w-full glass-input text-sm"
                    >
                      {plans.map(p => (
                        <option key={p.name} value={`${p.name} - ${p.price}`}>{p.name} - {p.price}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">အရေအတွက် (Quantity)</label>
                    <input 
                      type="number" 
                      min="1"
                      value={item.qty} 
                      onChange={e => updateItem(index, 'qty', parseInt(e.target.value) || 1)} 
                      className="w-full glass-input text-sm" 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payment Method</label>
              <select 
                value={paymentMethod} 
                onChange={e => setPaymentMethod(e.target.value)} 
                className="w-full glass-input"
              >
                {paymentMethods.map(pm => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ရက်စွဲ</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                className="w-full glass-input" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Discount (လျော့ပေးငွေ)</label>
              <input 
                type="number" 
                value={discount} 
                onChange={e => setDiscount(e.target.value === '' ? '' : Number(e.target.value))} 
                className="w-full glass-input" 
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo ပုံထည့်ရန် (Optional)</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={handleLogoUpload} 
                className="w-full p-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-md focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
              />
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">Voucher Preview</h3>
            <button 
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition shadow-md flex items-center gap-2"
            >
              <i className="fa-solid fa-download"></i> Save as Image
            </button>
          </div>
          
          <div className="overflow-x-auto pb-4">
            <div 
              ref={voucherRef} 
              data-voucher="true"
              className="bg-white p-10 rounded-none shadow-2xl w-full max-w-md mx-auto relative overflow-hidden text-gray-900 font-sans border-[12px] border-double border-slate-100"
              style={{ minWidth: '400px' }}
            >
              {/* Luxury Background Accents */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-slate-50 rounded-full -ml-12 -mb-12 opacity-50"></div>
              
              {/* Header Section */}
              <div className="relative z-10 text-center mb-10">
                <div className="flex justify-center items-center mb-6">
                  <div className="relative p-1 border border-slate-200 rounded-full">
                    {logoUrl ? (
                      <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="w-16 h-16 object-contain rounded-full"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-900 text-white">
                        <i className="fa-solid fa-crown text-2xl"></i>
                      </div>
                    )}
                  </div>
                </div>
                
                <h1 className="font-serif text-3xl font-bold tracking-tight text-slate-900 uppercase mb-1">Jump Jump VPN</h1>
                <div className="flex items-center justify-center gap-3">
                  <div className="h-[1px] w-8 bg-slate-300"></div>
                  <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Premium Service Receipt</p>
                  <div className="h-[1px] w-8 bg-slate-300"></div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="relative z-10 space-y-6 mb-10">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="text-slate-400 uppercase tracking-widest font-bold text-[9px]">Issued Date</p>
                    <p className="font-medium text-slate-900">{date}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-slate-400 uppercase tracking-widest font-bold text-[9px]">Receipt No.</p>
                    <p className="font-mono text-slate-900">#{(Math.random() * 10000).toFixed(0).padStart(5, '0')}</p>
                  </div>
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-4">
                  <p className="text-slate-400 uppercase tracking-widest font-bold text-[9px]">Client Name</p>
                  <p className="font-serif text-lg text-slate-900 italic">{customerName || 'Valued Customer'}</p>
                </div>
                
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-slate-400 uppercase tracking-widest font-bold text-[9px] mb-2">Service Details</p>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start group">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm">{item.plan.split(' - ')[0]}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{item.email || 'No email provided'}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 text-sm">{formatNum((parseInt(item.plan.split(' - ')[1].replace(/[^0-9]/g, '')) || 0) * item.qty)} Ks</p>
                          <p className="text-[9px] text-slate-400 font-medium">{item.qty} Unit(s)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between items-center border-t border-slate-100 pt-4">
                  <span className="text-slate-400 uppercase tracking-widest font-bold text-[9px]">Payment Method</span>
                  <span className="font-bold text-slate-900 text-xs">{paymentMethod}</span>
                </div>
                
                {Number(discount) > 0 && (
                  <div className="flex justify-between items-center text-red-600">
                    <span className="uppercase tracking-widest font-bold text-[9px]">Loyalty Discount</span>
                    <span className="font-bold text-sm">-{formatNum(Number(discount))} Ks</span>
                  </div>
                )}
              </div>

              {/* Total Section */}
              <div className="relative z-10 bg-slate-900 text-white p-6 -mx-10 mb-10 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-slate-400 uppercase tracking-widest font-bold text-[9px]">Total Investment</p>
                  <p className="text-xs text-slate-500 italic">Thank you for choosing excellence.</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-serif font-bold tracking-tight">{formatNum(totalAmount)} Ks</p>
                </div>
              </div>

              {/* Footer Section */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="mb-6 p-1 bg-white border border-slate-100 shadow-sm">
                  <QRCodeSVG 
                    value={qrData} 
                    size={512} 
                    level={"H"}
                    includeMargin={false}
                    style={{ width: '120px', height: '120px' }}
                  />
                </div>
                
                <div className="text-center space-y-3">
                  <p className="font-serif italic text-slate-500 text-sm">Jump Jump VPN — Security & Privacy</p>
                  <div className="flex items-center justify-center gap-4 text-[10px] font-bold tracking-widest uppercase text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <i className="fa-brands fa-telegram text-slate-300"></i>
                      @AHM_ADMIN
                    </span>
                    <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                    <span>Yangon, Myanmar</span>
                  </div>
                </div>
              </div>

              {/* Bottom Decorative Bar */}
              <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-900"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
