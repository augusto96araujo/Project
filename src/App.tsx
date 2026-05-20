import { useState, useEffect } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Activity, Clock, LogOut, Users, Box, ChevronRight, Loader2, ArrowRightLeft, Search, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CTOList } from './components/CTOList';
import { ClientList } from './components/ClientList';
import { Dashboard } from './components/Dashboard';
import { WaitingQueue } from './components/WaitingQueue';
import { cn } from './lib/utils';

type View = 'dashboard' | 'ctos' | 'clients' | 'queue';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [openModalAction, setOpenModalAction] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavigate = (view: View) => {
    setCurrentView(view);
    if (window.innerWidth <= 1024) {
      setIsSidebarOpen(false);
    }
  };

  const navigateToAndOpen = (view: View, action: string) => {
    setCurrentView(view);
    setOpenModalAction(action);
    if (window.innerWidth <= 1024) {
      setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="mt-4 text-xs font-mono uppercase tracking-widest opacity-50">Iniciando NetManager...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 font-sans p-6 text-slate-900">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white border border-slate-200 shadow-xl rounded-2xl p-10"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-indigo-600 p-2.5 rounded-lg">
              <Network className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">NetManager Pro</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Network Control Center</p>
            </div>
          </div>
          
          <h2 className="text-xl font-semibold mb-3">Bem-vindo de volta</h2>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Gerencie suas CTOs e clientes com precisão técnica e eficiência em uma interface moderna.
          </p>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white py-3.5 px-6 rounded-xl hover:bg-indigo-700 transition-all font-semibold shadow-lg shadow-indigo-200"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4 invert" alt="Google" />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth <= 1024 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "bg-slate-900 text-slate-300 flex flex-col z-40 border-r border-slate-800 shadow-2xl transition-all duration-300 fixed lg:relative inset-y-0 left-0",
        isSidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full lg:translate-x-0 lg:w-20"
      )}>
        <div className="p-6 border-b border-slate-800 flex items-center gap-3 overflow-hidden h-20">
          <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-indigo-500/20">
            N
          </div>
          {isSidebarOpen && (
            <div className="whitespace-nowrap">
              <h1 className="text-base font-bold text-white tracking-tight leading-none uppercase">NetManager</h1>
              <p className="text-[9px] text-slate-500 font-mono mt-1">STATUS: ONLINE</p>
            </div>
          )}
        </div>

        <nav className="flex-1 py-10 px-3 space-y-1.5 overflow-y-auto">
          {isSidebarOpen && (
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-3">Navegação Principal</div>
          )}
            {[
            { id: 'dashboard', label: 'Dashboard', icon: Activity },
            { id: 'ctos', label: 'Centro de CTOs', icon: Box },
            { id: 'clients', label: 'Base de Clientes', icon: Users },
            { id: 'queue', label: 'Fila de Espera', icon: Clock },
          ].map((item) => (
            <button
              id={`nav-${item.id}`}
              key={item.id}
              onClick={() => handleNavigate(item.id as View)}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all group relative",
                currentView === item.id 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                  : "hover:bg-slate-800 text-slate-400 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0 transition-transform", currentView !== item.id && "group-hover:scale-110")} />
              {isSidebarOpen && <span className="text-sm font-semibold">{item.label}</span>}
              {!isSidebarOpen && (
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap border border-slate-700">
                  {item.label}
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2 overflow-hidden">
            <img 
              src={user.photoURL || ''} 
              alt={user.displayName || ''} 
              className="w-10 h-10 rounded-xl border-2 border-slate-700 shrink-0 object-cover"
            />
            {isSidebarOpen && (
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-slate-500 truncate font-mono">{user.email}</p>
              </div>
            )}
          </div>
          <button 
            id="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-4 p-3 hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-all rounded-xl"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="text-sm font-semibold">Sair da Conta</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 lg:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-10 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              id="sidebar-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 hover:bg-slate-100 transition-colors text-slate-400 rounded-lg"
            >
              <ArrowRightLeft className="w-4 h-4 md:w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[9px] lg:text-[11px] font-bold uppercase tracking-widest truncate max-w-[60px] lg:max-w-none">{currentView}</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-30 shrink-0" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-slate-900">Gerenciamento</span>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-6">
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Busca..."
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-100 border-transparent rounded-lg text-[13px] w-28 sm:w-48 lg:w-72 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none border border-transparent focus:border-indigo-100"
              />
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:flex p-2 hover:bg-slate-100 transition-colors text-slate-400 rounded-xl border border-slate-100"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50 relative p-4 lg:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="max-w-7xl mx-auto"
            >
              {currentView === 'dashboard' && (
                <Dashboard onAction={navigateToAndOpen} />
              )}
              {currentView === 'ctos' && (
                <CTOList 
                  searchTerm={globalSearchTerm} 
                  forceOpenModal={openModalAction === 'new-cto'}
                  onModalClose={() => setOpenModalAction(null)}
                />
              )}
              {currentView === 'clients' && (
                <ClientList 
                  searchTerm={globalSearchTerm} 
                  forceOpenModal={openModalAction === 'new-client'}
                  onModalClose={() => setOpenModalAction(null)}
                />
              )}
              {currentView === 'queue' && (
                <WaitingQueue />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
