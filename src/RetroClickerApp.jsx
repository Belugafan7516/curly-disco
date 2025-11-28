import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  setLogLevel
} from 'firebase/firestore';
import { 
  Terminal, Zap, HardDrive, Cpu, Disc, Wifi, Users, Trophy, 
  Activity, MousePointer2, MessageSquare, Send, Award, Lock, Globe 
} from 'lucide-react';

// --- Configuration & Constants ---
const UPGRADES = [
  { id: 'cursor', name: 'Auto-Clicker', cps: 1, baseCost: 15, icon: <MousePointer2 size={16} /> },
  { id: 'floppy', name: 'Floppy Disk', cps: 5, baseCost: 100, icon: <Disc size={16} /> },
  { id: 'modem', name: '56k Modem', cps: 20, baseCost: 500, icon: <Wifi size={16} /> },
  { id: 'crt', name: 'CRT Monitor', cps: 50, baseCost: 2000, icon: <Terminal size={16} /> },
  { id: 'server', name: 'Mainframe', cps: 150, baseCost: 10000, icon: <HardDrive size={16} /> },
  { id: 'ai', name: 'AI Core', cps: 500, baseCost: 50000, icon: <Cpu size={16} /> },
  { id: 'quantum', name: 'Quantum Svr', cps: 1500, baseCost: 250000, icon: <Zap size={16} /> },
  { id: 'botnet', name: 'Global Botnet', cps: 5000, baseCost: 1000000, icon: <Globe size={16} /> },
];

const TROPHIES = [
  { id: 'hello_world', name: 'Hello World', description: 'Click 1 time', condition: (s: number, c: number, i: any) => s >= 1 },
  { id: 'script_kiddie', name: 'Script Kiddie', description: 'Reach 1,000 Bytes', condition: (s: number, c: number, i: any) => s >= 1000 },
  { id: 'hacker', name: 'Hacker', description: 'Reach 100 CPS', condition: (s: number, c: number, i: any) => c >= 100 },
  { id: 'sysadmin', name: 'Sysadmin', description: 'Own a Mainframe', condition: (s: number, c: number, i: any) => i['server'] >= 1 },
  { id: 'singularity', name: 'Singularity', description: 'Reach 1M Bytes', condition: (s: number, c: number, i: any) => s >= 1000000 },
  { id: 'overlord', name: 'Net Overlord', description: 'Reach 5,000 CPS', condition: (s: number, c: number, i: any) => c >= 5000 },
];

// --- Firebase Initialization (Global, then assigned in App) ---

declare const __firebase_config: string | undefined;
declare const __app_id: string | undefined;
declare const __initial_auth_token: string | undefined;

// FIX: Sanitize the appId to ensure it only contains a single segment, 
// preventing the runtime environment's file path context from breaking Firestore's path rules.
let rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const appId = rawAppId.split('/')[0];

const firebaseConfigString = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
const firebaseConfig = JSON.parse(firebaseConfigString); 

// Initialize Firebase services outside of the component to ensure single instantiation
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  setLogLevel('debug'); // Enable debug logging for troubleshooting
} catch (e) {
  console.error("Firebase initialization failed:", e);
}

// --- Utility Functions ---
const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return Math.floor(num).toString();
};

const calculateCost = (baseCost: number, count: number) => {
  return Math.floor(baseCost * Math.pow(1.15, count));
};

// --- Components ---

const RetroOverlay = () => (
  <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden h-full w-full">
    {/* Enhanced Scanlines */}
    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.4)_50%),linear-gradient(90deg,rgba(0,255,0,0.06),rgba(0,0,255,0.02),rgba(255,0,0,0.06))] bg-[length:100%_3px,3px_100%] opacity-70 pointer-events-none" />
    {/* Glitch/Flicker */}
    <div className="absolute inset-0 bg-white opacity-[0.03] animate-flicker pointer-events-none mix-blend-overlay" />
    {/* Vignette */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
  </div>
);

const Particle = ({ x, y, value, onComplete }: { x: number, y: number, value: number, onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div 
      className="absolute text-lime-400 font-bold pointer-events-none select-none animate-float-up text-xl z-20"
      style={{ left: x, top: y }}
    >
      +{value}
    </div>
  );
};

export default function App() {
  // --- State ---
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false); // Flag to ensure auth is complete
  const [username, setUsername] = useState<string>('');
  const [hasJoined, setHasJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Game State
  const [score, setScore] = useState(0);
  const [cps, setCps] = useState(0);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [unlockedTrophies, setUnlockedTrophies] = useState<string[]>([]);
  const [particles, setParticles] = useState<{id: number, x: number, y: number, value: number}[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date()); 
  
  // Multiplayer State
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // UI State
  const [leftTab, setLeftTab] = useState<'leaderboard' | 'chat'>('leaderboard');
  const [rightTab, setRightTab] = useState<'upgrades' | 'trophies'>('upgrades');

  // Refs
  const scoreRef = useRef(score);
  const cpsRef = useRef(cps);
  const inventoryRef = useRef(inventory);
  const trophiesRef = useRef(unlockedTrophies);
  const unsavedChanges = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // --- Firestore Path Helper ---
  const getCollectionPath = useCallback((type: 'scores' | 'chat') => {
    // Both scores and chat are public data collections
    return `artifacts/${appId}/public/data/${type}`;
  }, []);

  // --- Auth & Initial Load ---
  useEffect(() => {
    if (!auth || !db) return;

    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    
    // Listener for Auth State Changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUserId(currentUser.uid);
      } else {
        setUserId(null);
      }
      setAuthReady(true); // Auth process is complete
      setLoading(false);
    });
    
    // Initial sign-in attempt
    const attemptAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Authentication failed:", e);
      }
    };

    attemptAuth();
    return () => unsubscribe(); // Cleanup auth listener
  }, []);

  // --- Sync References ---
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { cpsRef.current = cps; }, [cps]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { trophiesRef.current = unlockedTrophies; }, [unlockedTrophies]);
  
  // --- Clock Loop (1s Interval) ---
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Game Loop (1s Interval) ---
  useEffect(() => {
    if (!hasJoined) return;

    const interval = setInterval(() => {
      if (cpsRef.current > 0) {
        setScore(prev => prev + cpsRef.current);
        unsavedChanges.current = true;
      }
      checkTrophies();
    }, 1000);

    return () => clearInterval(interval);
  }, [hasJoined]);

  // --- Check Trophies ---
  const checkTrophies = () => {
    const currentScore = scoreRef.current;
    const currentCps = cpsRef.current;
    const currentInventory = inventoryRef.current;
    const currentTrophies = trophiesRef.current;
    
    let newUnlock = false;
    const newTrophies = [...currentTrophies];

    TROPHIES.forEach(trophy => {
      if (!currentTrophies.includes(trophy.id)) {
        if (trophy.condition(currentScore, currentCps, currentInventory)) {
          newTrophies.push(trophy.id);
          setNotification(`TROPHY UNLOCKED: ${trophy.name}`);
          setTimeout(() => setNotification(null), 3000);
          newUnlock = true;
        }
      }
    });

    if (newUnlock) {
      setUnlockedTrophies(newTrophies);
      unsavedChanges.current = true;
    }
  };

  // --- Firestore Sync (Debounced 2s) ---
  useEffect(() => {
    // Only proceed if user is logged in AND has joined the game
    if (!userId || !hasJoined) return;

    const syncInterval = setInterval(async () => {
      if (unsavedChanges.current) {
        try {
          const userDocRef = doc(db, getCollectionPath('scores'), userId);
          await setDoc(userDocRef, {
            username: username,
            score: scoreRef.current,
            cps: cpsRef.current,
            inventory: inventoryRef.current,
            trophies: trophiesRef.current,
            lastUpdated: serverTimestamp()
          }, { merge: true });
          unsavedChanges.current = false;
        } catch (e) {
          console.error("Sync failed", e);
        }
      }
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [userId, hasJoined, username, getCollectionPath]);

  // --- Listeners (Leaderboard & Chat) ---
  useEffect(() => {
    // FIX: Auth Guard. Only start listeners once authenticated state is confirmed.
    if (!authReady || !userId || !db) return;

    // Leaderboard
    const scoresRef = collection(db, getCollectionPath('scores'));
    const unsubLeaderboard = onSnapshot(scoresRef, (snapshot) => {
      const players = [];
      let total = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        players.push({ id: doc.id, ...data });
        total += (data.score || 0);
      });
      players.sort((a, b) => (b.score || 0) - (a.score || 0));
      setLeaderboard(players);
      setGlobalTotal(total);
    }, (error) => {
        console.error("Leaderboard snapshot error:", error.message);
    });

    // Chat
    const chatRef = collection(db, getCollectionPath('chat'));
    const unsubChat = onSnapshot(query(chatRef), (snapshot) => {
      const messages = [];
      snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
      // Client-side sort: We rely on the timestamp being set on creation
      messages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setChatMessages(messages.slice(-50));
      
      // Auto-scroll chat to bottom
      if (chatContainerRef.current) {
        setTimeout(() => {
           chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }, 100);
      }
    }, (error) => {
        console.error("Chat snapshot error:", error.message);
    });

    return () => {
      unsubLeaderboard();
      unsubChat();
    };
  }, [authReady, userId, getCollectionPath]); // Dependencies on auth state

  // --- Actions ---

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !userId) return;
    
    // Restore data if exists
    const existingData = leaderboard.find(p => p.id === userId);
    if (existingData) {
       setScore(existingData.score || 0);
       setCps(existingData.cps || 0);
       setInventory(existingData.inventory || {});
       setUnlockedTrophies(existingData.trophies || []);
    }
    setHasJoined(true);
    // Initial sync to set username/presence
    unsavedChanges.current = true;
  };

  const handleClick = (e) => {
    const rect = (e.currentTarget).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const id = Date.now();
    setParticles(prev => [...prev, { id, x, y, value: 1 }]);
    
    setScore(prev => prev + 1);
    unsavedChanges.current = true;
    checkTrophies();
  };

  const buyUpgrade = (upgrade) => {
    const currentCount = inventory[upgrade.id] || 0;
    const cost = calculateCost(upgrade.baseCost, currentCount);

    if (score >= cost) {
      setScore(prev => prev - cost);
      setInventory(prev => ({ ...prev, [upgrade.id]: currentCount + 1 }));
      setCps(prev => prev + upgrade.cps);
      unsavedChanges.current = true;
      checkTrophies();
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    try {
      await addDoc(collection(db, getCollectionPath('chat')), {
        username: username,
        text: newMessage.trim(),
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // --- Styles (Embedded CSS with Tailwind class definitions) ---
  const styles = `
    /* Injecting Font Import directly into the component's style block */
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    
    .font-retro { font-family: 'Press Start 2P', cursive; }
    
    /* Animations using custom keyframes defined in tailwind.config.js */
    @keyframes float-up {
      0% { transform: translateY(0); opacity: 1; }
      100% { transform: translateY(-50px); opacity: 0; }
    }
    @keyframes flicker {
      0%, 100% { opacity: 0.05; }
      50% { opacity: 0.1; }
      52% { opacity: 0.05; }
      54% { opacity: 0.15; }
      56% { opacity: 0.05; }
      58% { opacity: 0.2; }
    }
    /* Enhanced Glow with Lime Green */
    @keyframes pulse-glow {
      0%, 100% { text-shadow: 0 0 5px #a7f3d0, 0 0 10px #4ade80; } /* Subtle initial glow */
      50% { text-shadow: 0 0 10px #86efac, 0 0 30px #a3e635; } /* Brighter, lime-focused glow */
    }
    @keyframes slide-down {
        from { transform: translateY(-100%) translateX(-50%); opacity: 0; }
        to { transform: translateY(0) translateX(-50%); opacity: 1; }
    }
    .animate-float-up { animation: float-up 0.8s ease-out forwards; }
    .animate-flicker { animation: flicker 4s infinite; }
    .animate-pulse-glow { animation: pulse-glow 2s infinite; }
    .animate-slide-down { animation: slide-down 0.5s cubic-bezier(0.25, 1, 0.5, 1); }

    /* Custom Scrollbar for Retro Feel */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #020617; }
    ::-webkit-scrollbar-thumb { background: #65a30d; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #bef264; }

    /* Custom Cursors for Retro Feel */
    .cursor-default-retro { cursor: default; }
    .cursor-pointer-retro { cursor: pointer; }
    .cursor-crosshair-retro { cursor: crosshair; }
  `;

  // --- Render Login ---

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-lime-400 font-retro flex items-center justify-center p-4 relative overflow-hidden">
        <style>{styles}</style>
        <div className="relative z-10 text-center">
            <h1 className="text-2xl text-lime-300 mb-4 animate-pulse-glow">SYSTEM INITIATING...</h1>
            <div className="w-12 h-12 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
        <RetroOverlay />
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-slate-950 text-lime-400 font-retro flex items-center justify-center p-4 relative overflow-hidden cursor-default-retro">
        <style>{styles}</style>
        <RetroOverlay />
        
        <div className="relative z-10 max-w-md w-full bg-slate-900 border-2 border-lime-700 p-8 shadow-[0_0_20px_rgba(163,230,53,0.3)]">
          <div className="text-center mb-8">
            <h1 className="text-4xl text-lime-300 mb-2 animate-pulse-glow">SYS.LINK</h1>
            <p className="text-xs text-lime-700">SECURE TERMINAL UPLINK v2.1</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-xs uppercase mb-2 text-lime-600">Enter Agent ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={12}
                className="w-full bg-black border-2 border-lime-800 text-lime-400 p-4 focus:border-lime-400 focus:outline-none focus:shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-all placeholder-lime-900"
                placeholder="USER_NAME..."
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!username.trim() || !authReady}
              className="w-full bg-lime-900/30 border-2 border-lime-600 text-lime-400 p-4 hover:bg-lime-500 hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest cursor-pointer-retro"
            >
              Initialize Connection
            </button>
            <div className="text-[8px] text-lime-700 text-center mt-4 break-all">
                AGENT UID: {userId || 'Authenticating...'}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- Render Game ---

  return (
    <div className="min-h-screen bg-slate-950 text-lime-400 font-retro overflow-hidden relative flex flex-col h-screen cursor-default-retro">
      <style>{styles}</style>
      <RetroOverlay />

      {/* Notification Toast */}
      {notification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-lime-900/90 text-lime-100 px-6 py-4 border-2 border-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.5)] animate-slide-down flex items-center gap-3">
          <Trophy className="text-yellow-400" size={24} />
          <span>{notification}</span>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 border-b-2 border-lime-900 bg-slate-900/80 p-3 md:p-4 flex justify-between items-center backdrop-blur-sm shadow-lg shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-lime-500 rounded-full animate-ping absolute" />
          <div className="w-3 h-3 bg-lime-500 rounded-full relative" />
          <div>
            <h1 className="text-lg md:text-xl text-lime-400 leading-none">SYS.LINK</h1>
            <span className="text-[10px] text-lime-700">NODES: {leaderboard.length}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] md:text-xs text-lime-700">TRAFFIC</div>
          <div className="text-lime-300 text-sm md:text-base">{formatNumber(globalTotal)} PKTS</div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Panel: Leaderboard & Chat */}
        <aside className="hidden md:flex flex-col w-72 border-r-2 border-lime-900 bg-slate-900/50">
          <div className="flex border-b border-lime-900 shrink-0">
            <button 
              onClick={() => setLeftTab('leaderboard')}
              className={`flex-1 p-3 text-xs flex items-center justify-center gap-2 hover:bg-lime-900/20 ${leftTab === 'leaderboard' ? 'bg-lime-900/30 text-lime-300' : 'text-lime-800'} cursor-pointer-retro`}
            >
              <Users size={14} /> NODES
            </button>
            <button 
              onClick={() => setLeftTab('chat')}
              className={`flex-1 p-3 text-xs flex items-center justify-center gap-2 hover:bg-lime-900/20 ${leftTab === 'chat' ? 'bg-lime-900/30 text-lime-300' : 'text-lime-800'} cursor-pointer-retro`}
            >
              <MessageSquare size={14} /> COMMS
            </button>
          </div>

          {leftTab === 'leaderboard' ? (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {leaderboard.map((player, idx) => (
                <div 
                  key={player.id} 
                  className={`p-2 border border-lime-900/30 flex justify-between items-center ${player.id === userId ? 'bg-lime-900/30 border-lime-500/50' : ''}`}
                >
                  <div className="flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-xs truncate text-lime-300 max-w-[100px]">{idx + 1}. {player.username}</span>
                      {player.trophies && player.trophies.length > 0 && (
                        <span className="text-[8px] px-1 bg-yellow-900/30 text-yellow-500 border border-yellow-800/50 rounded">{player.trophies.length}🏆</span>
                      )}
                    </div>
                    <span className="text-[10px] text-lime-700">{formatNumber(player.cps || 0)} CPS</span>
                  </div>
                  <span className="text-xs text-lime-400 ml-2">{formatNumber(player.score || 0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={msg.id || i} className="break-words">
                    <span className="text-[10px] text-lime-600 opacity-70">
                      {msg.username || 'Unknown'}:
                    </span>
                    <span className="text-xs text-lime-400 ml-2 block bg-lime-900/10 p-1 rounded border border-lime-900/20">
                      {msg.text}
                    </span>
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} className="p-2 border-t border-lime-900/50 flex gap-2">
                <input 
                  className="flex-1 bg-black border border-lime-800 text-xs p-2 text-lime-300 focus:outline-none focus:border-lime-500"
                  placeholder="Transmit..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                />
                <button type="submit" disabled={!authReady} className="bg-lime-800/30 p-2 border border-lime-700 text-lime-400 hover:bg-lime-700/50 cursor-pointer-retro disabled:opacity-30">
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}
        </aside>

        {/* Center: The Game */}
        <section className="flex-1 flex flex-col relative min-w-0">
          
          {/* Stats Bar */}
          <div className="flex justify-around p-4 md:p-6 bg-slate-900/30 shrink-0">
            <div className="text-center">
              <div className="text-[10px] md:text-xs text-lime-700 mb-1">LOCAL STORAGE</div>
              <div className="text-2xl md:text-5xl text-lime-400 animate-pulse-glow">{formatNumber(Math.floor(score))}</div>
              <div className="text-[8px] md:text-[10px] text-lime-600 mt-1">BYTES</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] md:text-xs text-lime-700 mb-1">TRANSFER RATE</div>
              <div className="text-xl md:text-3xl text-lime-300">{formatNumber(cps)}</div>
              <div className="text-[8px] md:text-[10px] text-lime-600 mt-1">B/SEC</div>
            </div>
          </div>

          {/* Click Area */}
          <div className="flex-1 flex items-center justify-center p-8 select-none overflow-hidden relative">
            <button 
              onClick={handleClick}
              className="relative group active:scale-95 transition-transform duration-75 outline-none z-30 cursor-crosshair-retro"
            >
              <div className="absolute inset-0 bg-lime-500 blur-[50px] opacity-20 group-hover:opacity-30 transition-opacity rounded-full pointer-events-none" />
              <div className="relative w-48 h-48 md:w-64 md:h-64 bg-slate-900 border-4 border-lime-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(163,230,53,0.3)] group-hover:shadow-[0_0_50px_rgba(163,230,53,0.5)] group-hover:border-lime-400 transition-all overflow-visible">
                <div className="text-lime-500 group-hover:text-lime-300 transition-colors pointer-events-none">
                  <Terminal size={64} className="md:w-24 md:h-24" />
                </div>
                {/* Particles inside the button's coordinate space */}
                {particles.map(p => (
                   <Particle 
                     key={p.id} 
                     x={p.x} 
                     y={p.y} 
                     value={p.value} 
                     onComplete={() => setParticles(prev => prev.filter(particle => particle.id !== p.id))} 
                   />
                ))}
              </div>
              <div className="absolute -bottom-12 left-0 right-0 text-center text-xs text-lime-700 animate-pulse pointer-events-none">
                [ CLICK TO MINE ]
              </div>
            </button>
          </div>

          {/* Mobile Tabs Hint */}
          <div className="md:hidden p-2 text-center text-[10px] text-lime-800 border-t border-lime-900/30">
            Scroll down for upgrades & trophies
          </div>
        </section>

        {/* Right Panel: Upgrades & Trophies */}
        <aside className="flex-1 md:w-80 md:flex-none border-t-2 md:border-t-0 md:border-l-2 border-lime-900 bg-slate-900/50 flex flex-col h-1/2 md:h-auto overflow-hidden">
          <div className="flex border-b border-lime-900 shrink-0">
            <button 
              onClick={() => setRightTab('upgrades')}
              className={`flex-1 p-3 text-xs flex items-center justify-center gap-2 hover:bg-lime-900/20 ${rightTab === 'upgrades' ? 'bg-lime-900/30 text-lime-300' : 'text-lime-800'} cursor-pointer-retro`}
            >
              <Trophy size={14} /> UPGRADES
            </button>
            <button 
              onClick={() => setRightTab('trophies')}
              className={`flex-1 p-3 text-xs flex items-center justify-center gap-2 hover:bg-lime-900/20 ${rightTab === 'trophies' ? 'bg-lime-900/30 text-lime-300' : 'text-lime-800'} cursor-pointer-retro`}
            >
              <Award size={14} /> TROPHIES
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20 md:pb-4">
            {rightTab === 'upgrades' ? (
              UPGRADES.map(upgrade => {
                const count = inventory[upgrade.id] || 0;
                const cost = calculateCost(upgrade.baseCost, count);
                const canAfford = score >= cost;

                return (
                  <button
                    key={upgrade.id}
                    onClick={() => buyUpgrade(upgrade)}
                    disabled={!canAfford}
                    className={`w-full text-left p-3 border-2 transition-all group relative overflow-hidden ${
                      canAfford 
                        ? 'border-lime-700 bg-slate-900 hover:bg-lime-900/20 hover:border-lime-500 cursor-pointer-retro' 
                        : 'border-slate-800 bg-slate-900/50 text-lime-900 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex justify-between items-start relative z-10">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 bg-slate-800 border border-lime-900/50 rounded ${canAfford ? 'text-lime-400' : 'text-lime-900'}`}>
                          {upgrade.icon}
                        </div>
                        <div>
                          <div className={`text-xs ${canAfford ? 'text-lime-300' : 'text-lime-900'}`}>{upgrade.name}</div>
                          <div className="text-[10px] text-lime-600">+{upgrade.cps} CPS</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs ${canAfford ? 'text-lime-400' : 'text-red-900'}`}>{formatNumber(cost)}</div>
                        <div className="text-[10px] text-lime-800">OWNED: {count}</div>
                      </div>
                    </div>
                    {canAfford && (
                      <div 
                        className="absolute bottom-0 left-0 top-0 bg-lime-500/5 transition-all duration-500"
                        style={{ width: `${Math.min(100, (score / cost) * 100)}%` }}
                      />
                    )}
                  </button>
                );
              })
            ) : (
              // Trophies List
              TROPHIES.map(trophy => {
                const isUnlocked = unlockedTrophies.includes(trophy.id);
                return (
                  <div 
                    key={trophy.id}
                    className={`p-3 border-2 flex items-center gap-3 relative overflow-hidden ${isUnlocked ? 'border-yellow-700/50 bg-yellow-900/10' : 'border-slate-800 bg-slate-900/50 opacity-60'}`}
                  >
                    <div className={`p-2 rounded border ${isUnlocked ? 'bg-yellow-900/20 border-yellow-600 text-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-600'}`}>
                       {isUnlocked ? <Award size={16} /> : <Lock size={16} />}
                    </div>
                    <div>
                      <div className={`text-xs ${isUnlocked ? 'text-yellow-400' : 'text-slate-500'}`}>{trophy.name}</div>
                      <div className="text-[10px] text-slate-600">{trophy.description}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

      </main>
      
      {/* Taskbar Footer */}
      <footer className="relative z-20 w-full shrink-0 border-t-2 border-lime-700 bg-slate-900/90 p-1 flex justify-between items-center text-xs md:text-sm shadow-[0_-5px_20px_rgba(163,230,53,0.1)]">
        {/* Start Button (Mock) */}
        <div className="bg-lime-700 hover:bg-lime-600 active:bg-lime-800 transition-colors border-t-2 border-l-2 border-lime-300 border-b-2 border-r-2 border-slate-950 p-1 px-3 text-black font-bold cursor-pointer-retro shadow-md">
            S.Y.S
        </div>

        {/* Current App/Info (Window Button) */}
        <div className="hidden sm:flex flex-1 mx-4">
            <div className="flex items-center gap-2 p-1 px-3 bg-lime-900/40 border-t-2 border-l-2 border-lime-300 border-b-2 border-r-2 border-slate-950 text-lime-300 font-normal shadow-md truncate max-w-full">
                <Activity size={14} className="text-lime-500" />
                <span className="text-[10px] md:text-xs truncate">SYS.LINK: Agent {username} - CPS: {formatNumber(cps)}</span>
            </div>
        </div>

        {/* System Tray (Clock/Info) */}
        <div className="bg-slate-800 border-t-2 border-l-2 border-lime-800 border-b-2 border-r-2 border-lime-950 p-1 px-2 text-lime-500 flex items-center gap-2">
            <Cpu size={14} className="text-lime-500" />
            <span className="text-[10px] md:text-xs text-lime-400">
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
        </div>
      </footer>
    </div>
  );
}