import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, setDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyA84_UlfKU25PZsN0LISzd1NiFic58o16c",
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all">
        <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{title}</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
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
    }
  }, [user]);

  // Save Settings Effect
  useEffect(() => {
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    localStorage.setItem('vpn_settings', JSON.stringify(settings));
    
    if (user && db) {
      setDoc(doc(db, 'users', user.uid, 'settings', 'config'), settings).catch(console.error);
    }
  }, [settings, user]);

  useEffect(() => {
    if (!settings.pin) setIsLocked(false);
    else if (user) setIsLocked(true); // Re-evaluate lock when user changes
  }, [settings.pin, user]);

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

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500"><i className="fa-solid fa-spinner fa-spin text-3xl"></i></div>;
  }

  if (!user && auth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl w-full max-w-sm text-center">
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
              className="w-full text-center text-3xl tracking-[0.5em] p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl mb-6 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-0 transition outline-none"
              autoFocus
            />
            <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition shadow-lg shadow-blue-600/30">
              ဝင်မည်
            </button>
          </form>
        </div>
        <Modal {...modal} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition">
            <i className="fa-solid fa-bars text-xl"></i>
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hidden sm:block">
            VPN Agent Pro
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full text-sm font-medium">
            <i className="fa-solid fa-dollar-sign text-green-500"></i>
            <span>{settings.exchangeRate} MMK</span>
          </div>
          <button onClick={() => setSettings(s => ({ ...s, darkMode: !s.darkMode }))} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition w-10 h-10 flex items-center justify-center">
            <i className={`fa-solid ${settings.darkMode ? 'fa-sun text-yellow-400' : 'fa-moon text-gray-600'}`}></i>
          </button>
        </div>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}></div>
          <div className="relative w-80 bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col transform transition-transform">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold">မီနူး</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
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
                { id: 'settings', icon: 'fa-gear', label: 'ဆက်တင်များ' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition ${activeTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  <i className={`fa-solid ${tab.icon} w-5 text-center`}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
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
        {activeTab === 'profit-loss' && <ProfitLossStatement records={records} />}
        {activeTab === 'deposits' && <DepositsList records={records} />}
        {activeTab === 'expenses' && <ExpensesList records={records} />}
        {activeTab === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} user={user} />}
      </main>

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
  let insight = { type: 'info', icon: 'fa-lightbulb', text: 'ယနေ့အတွက် စာရင်းမသွင်းရသေးပါ။', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' };
  if (calc) {
    const stockAlert = safeFloat(settings.stockAlert);
    const currentStock = safeFloat(todayRecord?.nightClosing) || ((safeFloat(todayRecord?.morningOpening) + safeFloat(todayRecord?.stockAdded)));
    
    if (currentStock < stockAlert) {
      insight = { type: 'danger', icon: 'fa-triangle-exclamation', text: `သတိပြုရန်: လက်ကျန်ပွိုင့် (${formatNum(currentStock)}) သည် သတ်မှတ်ထားသော ပမာဏအောက် ရောက်နေပါသည်။`, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' };
    } else if (calc.netProfit > 100000) {
      insight = { type: 'success', icon: 'fa-arrow-trend-up', text: 'ဂုဏ်ယူပါသည်! ယနေ့ အသားတင်အမြတ် ၁ သိန်းကျော်ပါသည်။', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' };
    } else {
      insight = { type: 'info', icon: 'fa-check-circle', text: 'လုပ်ငန်းလည်ပတ်မှု ပုံမှန်ရှိပါသည်။', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' };
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
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">လစဉ် အမြတ်ပစ်မှတ်</h3>
            <div className="text-2xl font-bold">{formatNum(monthProfit)} <span className="text-sm font-normal text-gray-400">/ {formatNum(target)}</span></div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{progress.toFixed(1)}%</span>
          </div>
        </div>
        <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      {/* Best Day Comparison */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
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
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
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
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
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
    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
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
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
        <h2 className="text-xl font-bold">စာရင်းအသစ်သွင်းမည်</h2>
        <div className="flex gap-2">
          <button onClick={undo} disabled={!canUndo} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition"><i className="fa-solid fa-rotate-left"></i></button>
          <button onClick={redo} disabled={!canRedo} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition"><i className="fa-solid fa-rotate-right"></i></button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-8">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ရက်စွဲ</label>
          <input type="date" value={state.date} onChange={e => handleChange('date', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition" />
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
                <input list="expense-desc" placeholder="အကြောင်းအရာ" value={exp.desc} onChange={e => handleExpenseChange(i, 'desc', e.target.value)} className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="number" placeholder="ပမာဏ" value={exp.amount} onChange={e => handleExpenseChange(i, 'amount', e.target.value)} className="w-1/3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                <button onClick={() => removeExpense(i)} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition"><i className="fa-solid fa-trash"></i></button>
              </div>
            ))}
            {state.expenses.length === 0 && <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">ကုန်ကျစရိတ် မရှိပါ</div>}
          </div>
        </div>
      </div>

      {/* Live Preview & Submit */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 sm:p-6 border-t border-gray-100 dark:border-gray-800">
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
          className={`w-full p-3 ${icon ? 'pl-10' : ''} rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition`}
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
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      {/* Receipt Header */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center border-dashed">
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
          <div className="col-span-2 border-t border-gray-100 dark:border-gray-700 my-1"></div>
          <div className="font-bold">ရောင်းရပွိုင့်</div><div className="text-right font-mono font-bold">{formatNum(calc.soldPoints)}</div>
          <div className="text-gray-500">အရင်းငွေ (@{formatNum(safeFloat(record.costPerPoint))})</div><div className="text-right font-mono text-red-500">- {formatNum(calc.capitalCost)}</div>
        </div>

        {/* Sales */}
        <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sales</div>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <div className="text-gray-500">KBZ Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.kbzPay))}</div>
            <div className="text-gray-500">Wave Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.wavePay))}</div>
            <div className="text-gray-500">AYA Pay</div><div className="text-right font-mono">{formatNum(safeFloat(record.ayaPay))}</div>
            <div className="col-span-2 border-t border-gray-200 dark:border-gray-700 my-1"></div>
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
        <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-4 flex justify-between items-end">
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
    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
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
        <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
          <span className="font-medium">အသားတင်အမြတ်</span>
          <span className={`font-mono font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatNum(netProfit)}
          </span>
        </div>
        <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
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

      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input 
            type="text" 
            placeholder="ဘဏ်အမည် ရှာရန်..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
          />
        </div>
        <input 
          type="date" 
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
        />
        <input 
          type="date" 
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
        />
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between font-bold">
          <span>စုစုပေါင်း</span>
          <span className="text-purple-600">{formatNum(total)}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {deposits.length === 0 ? (
            <div className="p-8 text-center text-gray-500">မှတ်တမ်းမရှိပါ</div>
          ) : (
            deposits.map((d, i) => (
              <div key={i} className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-900/50 transition">
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

      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400"></i>
          <input 
            type="text" 
            placeholder="အကြောင်းအရာ ရှာရန်..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
          />
        </div>
        <input 
          type="date" 
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
        />
        <input 
          type="date" 
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 outline-none"
        />
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between font-bold">
          <span>စုစုပေါင်း</span>
          <span className="text-red-600">{formatNum(total)}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">မှတ်တမ်းမရှိပါ</div>
          ) : (
            expenses.map((e, i) => (
              <div key={i} className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-900/50 transition">
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

function ProfitLossStatement({ records }: { records: RecordData[] }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const monthRecords = records.filter(r => r.date.startsWith(selectedMonth));
  
  const totalSales = monthRecords.reduce((sum, r) => sum + calculateRecord(r).totalSales, 0);
  const totalCapital = monthRecords.reduce((sum, r) => sum + calculateRecord(r).capitalCost, 0);
  const totalExpenses = monthRecords.reduce((sum, r) => sum + calculateRecord(r).totalExpenses, 0);
  
  const grossProfit = totalSales - totalCapital;
  const netProfit = grossProfit - totalExpenses;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">အရှုံး/အမြတ် ရှင်းတမ်း</h2>
        <input 
          type="month" 
          value={selectedMonth} 
          onChange={e => setSelectedMonth(e.target.value)} 
          className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
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

        <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-gray-500 font-medium mb-2 uppercase tracking-widest text-sm">အသားတင် အမြတ် (Net Profit)</div>
            <div className={`text-5xl font-mono font-black ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatNum(netProfit)}
            </div>
            {totalSales > 0 && (
              <div className="mt-3 text-sm font-medium bg-gray-100 dark:bg-gray-900 px-3 py-1 rounded-full text-gray-600 dark:text-gray-400">
                Profit Margin: {((netProfit / totalSales) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, setSettings, user }: any) {
  const handleChange = (field: string, value: any) => {
    setSettings({ ...settings, [field]: value });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6 animate-in fade-in">
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
        <input type="password" value={settings.pin} onChange={e => handleChange('pin', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="PIN မထားလိုပါက အလွတ်ထားပါ" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">လစဉ် အမြတ်ပစ်မှတ် (Target)</label>
        <input type="number" value={settings.monthlyTarget} onChange={e => handleChange('monthlyTarget', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">လက်ကျန်ပွိုင့် သတိပေးချက် (Stock Alert)</label>
        <input type="number" value={settings.stockAlert} onChange={e => handleChange('stockAlert', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ဒေါ်လာ ငွေလဲနှုန်း (Exchange Rate)</label>
        <input type="number" value={settings.exchangeRate} onChange={e => handleChange('exchangeRate', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>
    </div>
  );
}
