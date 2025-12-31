
import React from 'react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  activeTab: 'planner' | 'inbox';
  setActiveTab: (tab: 'planner' | 'inbox') => void;
  unreadCount: number;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, activeTab, setActiveTab, unreadCount }) => {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col max-w-2xl mx-auto border-x border-white/5 relative">
      <header className="sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 p-5 flex items-center justify-between">
        <div className="flex items-center space-x-3 group cursor-pointer">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] group-hover:scale-105 transition-transform">
            <i className="fas fa-location-arrow text-base"></i>
          </div>
          <h1 className="font-extrabold text-2xl tracking-tighter premium-gradient-text">LastMile</h1>
        </div>
        {user && (
          <div className="flex items-center space-x-5">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-white tracking-tight">@{user.username}</span>
              <button 
                onClick={onLogout}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors uppercase font-black tracking-widest"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow p-5 pb-32">
        {children}
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md glass-card rounded-2xl flex justify-around p-2 expensive-shadow z-50 border border-white/10">
        <button 
          onClick={() => setActiveTab('planner')}
          className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all duration-300 ${activeTab === 'planner' ? 'bg-indigo-600/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <i className={`fas fa-compass text-xl mb-1 ${activeTab === 'planner' ? 'scale-110' : ''}`}></i>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Planner</span>
        </button>
        <button 
          onClick={() => setActiveTab('inbox')}
          className={`flex-1 relative flex flex-col items-center py-3 rounded-xl transition-all duration-300 ${activeTab === 'inbox' ? 'bg-indigo-600/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <i className={`fas fa-bell text-xl mb-1 ${activeTab === 'inbox' ? 'scale-110' : ''}`}></i>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Inbox</span>
          {unreadCount > 0 && (
            <span className="absolute top-2 right-1/3 bg-indigo-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
};

export default Layout;