
import React, { useState, useEffect, useRef } from 'react';
import { User, TripAnalysis, SharedSnapshot } from './types';
import Layout from './components/Layout';
import { getCoreAnalysis, getDeepAnalysis } from './services/geminiService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [activeTab, setActiveTab] = useState<'planner' | 'inbox'>('planner');
  const [inbox, setInbox] = useState<SharedSnapshot[]>([]);
  
  const [destination, setDestination] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [analysis, setAnalysis] = useState<TripAnalysis | null>(null);
  const [searchDuration, setSearchDuration] = useState<number | null>(null);
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [shareRecipient, setShareRecipient] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // Live Tracking State
  const [isOnWay, setIsOnWay] = useState(false);
  const liveIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('lastmile_user');
    if (savedUser) setUser(JSON.parse(savedUser));
    
    const savedInbox = localStorage.getItem('lastmile_inbox');
    if (savedInbox) setInbox(JSON.parse(savedInbox));

    const savedHistory = localStorage.getItem('lastmile_history');
    if (savedHistory) setSearchHistory(JSON.parse(savedHistory));

    return () => {
      if (liveIntervalRef.current) window.clearInterval(liveIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('lastmile_inbox', JSON.stringify(inbox));
  }, [inbox]);

  useEffect(() => {
    localStorage.setItem('lastmile_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    const newUser = { username: usernameInput.replace('@', '').toLowerCase() };
    setUser(newUser);
    localStorage.setItem('lastmile_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('lastmile_user');
    setIsOnWay(false);
  };

  const performSearch = async (targetDest?: string, isAutoRefresh = false) => {
    const finalDest = targetDest || destination;
    if (!finalDest) return;

    if (!isAutoRefresh) {
        setIsSearching(true);
        setAnalysis(null);
    }
    setSyncCooldown(10);
    const startTime = performance.now();

    if (!isAutoRefresh) {
      setSearchHistory(prev => {
        const filtered = prev.filter(h => h.toLowerCase() !== finalDest.toLowerCase());
        return [finalDest, ...filtered].slice(0, 5);
      });
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000
        });
      });
      const { latitude: lat, longitude: lng } = position.coords;

      // Fetch Core and Deep intelligence in parallel
      const [core, deep] = await Promise.all([
        getCoreAnalysis(finalDest, lat, lng),
        getDeepAnalysis(finalDest, lat, lng)
      ]);

      // Compile complete analysis after both APIs return
      const parkingOptions = deep.driving?.parkingOptions || [];
      const walkFromParkingMins = parkingOptions.length > 0 ? parkingOptions[0].walkTimeMins : 0;
      const totalDriveTime = (core.driving?.driveTimeMins || 0) + walkFromParkingMins;

      const completeAnalysis: TripAnalysis = {
        destination: core.destination || finalDest,
        timestamp: Date.now(),
        isOpenAtArrival: core.isOpenAtArrival ?? true,
        closingTime: core.closingTime,
        nextOpeningTime: core.nextOpeningTime,
        driving: {
          driveTimeMins: core.driving!.driveTimeMins,
          trafficStatus: core.driving!.trafficStatus as any,
          trafficTrend: deep.driving?.trafficTrend || 'stable',
          parkingOptions: parkingOptions,
          totalTimeMins: totalDriveTime,
        },
        walking: {
          walkTimeMins: core.walking!.walkTimeMins,
          temperature: deep.walking?.temperature,
          weatherCondition: deep.walking?.weatherCondition,
          weatherAlert: deep.walking?.weatherAlert,
          isRecommended: deep.walking?.isRecommended ?? true,
          recommendationReason: deep.walking?.recommendationReason,
        },
        groundingSources: deep.groundingSources || [],
      };

      setAnalysis(completeAnalysis);
      const endTime = performance.now();
      setSearchDuration((endTime - startTime) / 1000);

    } catch (err) {
      console.error("Analysis Failed:", err);
      if (!isAutoRefresh) alert("Intelligence Failure: Could not fetch trip data. Please try again.");
    } finally {
      if (!isAutoRefresh) setIsSearching(false);
    }
  };

  // Live Tracking Logic
  useEffect(() => {
    if (isOnWay && analysis) {
      liveIntervalRef.current = window.setInterval(() => {
        performSearch(analysis.destination, true);
      }, 120000); // 2 minutes
    } else {
      if (liveIntervalRef.current) {
        window.clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    }
    return () => {
      if (liveIntervalRef.current) window.clearInterval(liveIntervalRef.current);
    };
  }, [isOnWay, analysis?.destination]);

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('lastmile_history');
  };

  const handleShare = () => {
    if (!analysis || !shareRecipient) return;
    setIsSharing(true);
    const snapshot: SharedSnapshot = {
      id: Math.random().toString(36).substr(2, 9),
      from: user?.username || 'anonymous',
      to: shareRecipient.replace('@', '').toLowerCase(),
      data: analysis,
      sentAt: Date.now()
    };
    const allSnapshots = JSON.parse(localStorage.getItem('lastmile_all_snapshots') || '[]');
    allSnapshots.push(snapshot);
    localStorage.setItem('lastmile_all_snapshots', JSON.stringify(allSnapshots));
    if (snapshot.to === user?.username) setInbox(prev => [snapshot, ...prev]);
    setTimeout(() => {
      setIsSharing(false);
      setShareRecipient('');
      alert(`Plan Dispatched to @${snapshot.to}`);
    }, 800);
  };

  useEffect(() => {
    if (syncCooldown > 0) {
      const timer = setTimeout(() => setSyncCooldown(syncCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [syncCooldown]);

  const getTimeAgo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const getWeatherIcon = (condition?: string) => {
    if (!condition) return 'fa-spinner fa-spin text-zinc-800';
    const c = condition.toLowerCase();
    if (c.includes('snow')) return 'fa-snowflake text-blue-300';
    if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'fa-cloud-showers-heavy text-indigo-400';
    if (c.includes('cloud') || c.includes('overcast')) return 'fa-cloud text-zinc-500';
    if (c.includes('storm') || c.includes('thunder')) return 'fa-cloud-bolt text-yellow-400';
    return 'fa-sun text-orange-400';
  };

  const getTrafficColor = (status: string) => {
    const s = status ? status.toLowerCase() : 'clear';
    if (s.includes('gridlock') || s.includes('heavy')) return 'text-red-500';
    if (s.includes('moderate')) return 'text-yellow-500';
    return 'text-emerald-500';
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
           <div className="absolute -top-1/4 -left-1/4 w-full h-full bg-indigo-600/30 blur-[120px] rounded-full"></div>
        </div>
        <div className="glass-card rounded-[2.5rem] p-10 w-full max-w-md relative z-10 border border-white/10 expensive-shadow">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-2xl">
              <i className="fas fa-location-arrow text-3xl"></i>
            </div>
            <h1 className="text-4xl font-black tracking-tighter premium-gradient-text">LastMile</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="text" 
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="@username"
              className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-white font-bold text-center"
            />
            <button type="submit" className="w-full bg-white text-black py-5 rounded-2xl font-black hover:bg-zinc-200 transition-all uppercase tracking-widest text-xs">Initialize</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} unreadCount={inbox.length}>
      {activeTab === 'planner' ? (
        <div className="space-y-6">
          {/* LIVE TRACKER HEADER */}
          {isOnWay && analysis && (
            <div className="glass-card p-5 rounded-[2rem] border-2 border-indigo-500/30 bg-indigo-950/20 shadow-[0_0_30px_rgba(99,102,241,0.1)] animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center space-x-2">
                   <span className="relative flex h-3 w-3">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                   </span>
                   <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Live Mission Active</span>
                 </div>
                 <button 
                   onClick={() => setIsOnWay(false)}
                   className="text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                 >
                   End Trip
                 </button>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="flex flex-col">
                   <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Drive ETA</span>
                   <span className="text-3xl font-black text-white">{analysis.driving.totalTimeMins}<span className="text-sm text-zinc-600 ml-1">m</span></span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Walk ETA</span>
                   <span className="text-3xl font-black text-white">{analysis.walking.walkTimeMins}<span className="text-sm text-zinc-600 ml-1">m</span></span>
                 </div>
               </div>
               <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                 <span className="text-[8px] font-bold text-zinc-600 uppercase">Auto-refreshing 2m</span>
                 <span className="text-[8px] font-bold text-zinc-600 uppercase truncate max-w-[150px]">{analysis.destination}</span>
               </div>
            </div>
          )}

          {/* SEARCH BOX */}
          <div className="glass-card rounded-[2rem] p-4 border border-white/10 space-y-4">
            <div className="relative">
              <input 
                type="text"
                placeholder="Where to?"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                className="w-full pl-6 pr-4 py-5 bg-white/5 border border-white/5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-xl text-white font-bold"
              />
            </div>
            
            {searchHistory.length > 0 && (
              <div className="px-1 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Recent Missions</span>
                  <button onClick={clearHistory} className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map((h, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setDestination(h);
                        performSearch(h);
                      }}
                      className="px-4 py-2 bg-white/5 border border-white/5 rounded-xl text-[11px] font-bold text-zinc-300 hover:bg-white/10 hover:border-white/10 transition-all active:scale-95 flex items-center space-x-2"
                    >
                      <i className="fas fa-history text-[10px] opacity-40"></i>
                      <span className="truncate max-w-[120px]">{h}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button 
              onClick={() => performSearch()}
              disabled={isSearching || !destination}
              className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black disabled:bg-zinc-800 transition-all flex items-center justify-center space-x-3 text-xs uppercase tracking-widest"
            >
              {isSearching ? <i className="fas fa-spinner fa-spin"></i> : <span>Fetch Intelligence</span>}
            </button>
          </div>

          {analysis && !isSearching && (
            <div className="space-y-4 animate-in fade-in duration-500">
              {/* COMPACT DASHBOARD HEADER */}
              <div className="glass-card p-6 rounded-[2.5rem] border border-white/10 text-center space-y-3 relative overflow-hidden">
                <div className="flex justify-center">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] border ${analysis.isOpenAtArrival ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
                    {analysis.isOpenAtArrival ? 'OPERATIONAL' : 'CLOSED ON ARRIVAL'}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white tracking-tighter leading-none">{analysis.destination}</h2>
                <div className="flex items-center justify-center space-x-3 mt-1">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    {analysis.isOpenAtArrival ? `Closes: ${analysis.closingTime || '--:--'}` : `Opens: ${analysis.nextOpeningTime || '--:--'}`}
                  </p>
                  {searchDuration && (
                    <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest flex items-center border-l border-white/10 pl-3">
                      <i className="fas fa-bolt text-[8px] mr-1 text-indigo-500"></i>
                      {searchDuration.toFixed(1)}s
                    </span>
                  )}
                </div>
                
                {!isOnWay && (
                  <button 
                    onClick={() => setIsOnWay(true)}
                    className="w-full mt-4 bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-zinc-200 active:scale-95 transition-all"
                  >
                    On My Way
                  </button>
                )}
              </div>

              {/* HIGH SKIM COMPARISON GRID */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-6 rounded-[2rem] border border-white/10 text-center relative overflow-hidden">
                   <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">Drive Time</div>
                   <div className="text-4xl font-black text-white tracking-tighter mb-1">{analysis.driving.totalTimeMins}<span className="text-lg text-zinc-600 ml-1">m</span></div>
                   <div className={`text-[10px] font-extrabold uppercase ${getTrafficColor(analysis.driving.trafficStatus)}`}>
                     {analysis.driving.trafficStatus}
                   </div>
                   <i className="fas fa-car absolute -bottom-4 -right-4 text-6xl opacity-5"></i>
                </div>

                <div className="glass-card p-6 rounded-[2rem] border border-white/10 text-center relative overflow-hidden">
                   <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-2">Walk Time</div>
                   <div className="text-4xl font-black text-white tracking-tighter mb-1">{analysis.walking.walkTimeMins}<span className="text-lg text-zinc-600 ml-1">m</span></div>
                   <div className={`text-[10px] font-extrabold uppercase ${analysis.walking.isRecommended !== false ? 'text-emerald-500' : 'text-red-500'}`}>
                     {analysis.walking.isRecommended !== false ? 'GO' : 'AVOID'}
                   </div>
                   {analysis.walking.recommendationReason && (
                     <p className="text-[8px] font-black text-zinc-500 uppercase mt-1 px-2 line-clamp-1">{analysis.walking.recommendationReason}</p>
                   )}
                   <i className="fas fa-person-walking absolute -bottom-4 -right-4 text-6xl opacity-5"></i>
                </div>
              </div>

              {/* HAZARD STRIP */}
              {analysis.walking.weatherAlert && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center space-x-4 animate-pulse">
                  <i className="fas fa-exclamation-triangle text-red-500 text-xl"></i>
                  <p className="text-xs font-bold text-white">{analysis.walking.weatherAlert}</p>
                </div>
              )}

              {/* VERTICAL INTELLIGENCE STACK */}
              <div className="space-y-4">
                {/* LIVE WEATHER */}
                <div className="glass-card p-5 rounded-[2rem] border border-white/10 relative overflow-hidden min-h-[120px]">
                  <div className="flex items-center space-x-2 mb-4 border-b border-white/5 pb-2">
                    <i className="fas fa-cloud-sun text-emerald-400"></i>
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Environment Intel</span>
                  </div>
                  <div className="flex items-center space-x-5">
                    <i className={`fas ${getWeatherIcon(analysis.walking.weatherCondition)} text-5xl`}></i>
                    <div className="flex flex-col">
                      <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-black text-white leading-none">{analysis.walking.temperature ?? '--'}</span>
                        <span className="text-lg font-bold text-zinc-500">°C</span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-black uppercase tracking-tight mt-1">{analysis.walking.weatherCondition || 'Detecting...'}</span>
                    </div>
                  </div>
                </div>

                {/* PARKING GATE */}
                <div className="glass-card p-5 rounded-[2.5rem] border border-white/10 relative overflow-hidden min-h-[140px]">
                  <div className="flex items-center space-x-2 mb-4 border-b border-white/5 pb-2">
                    <i className="fas fa-square-p text-indigo-400"></i>
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Gate Accuracy</span>
                  </div>
                  <div className="space-y-3">
                    {analysis.driving.parkingOptions?.length ? (
                      analysis.driving.parkingOptions.slice(0, 3).map((lot, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                          <div className="flex flex-col">
                            <span className="font-black text-zinc-100 text-xs">{lot.name}</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase">{lot.entranceType}</span>
                          </div>
                          <span className="font-black text-white text-xs">+{lot.walkTimeMins}m</span>
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center text-[9px] font-black text-zinc-700 uppercase tracking-widest">Scanning local gates...</div>
                    )}
                  </div>
                </div>
              </div>

              {/* SOCIAL SNAPSHOT */}
              <div className="bg-indigo-600 rounded-[2.5rem] p-5 shadow-2xl flex items-center space-x-3">
                <input 
                  type="text"
                  placeholder="Dispatch to @username"
                  value={shareRecipient}
                  onChange={(e) => setShareRecipient(e.target.value)}
                  className="flex-grow px-5 py-4 bg-white/10 border border-white/10 rounded-2xl text-white font-bold text-xs outline-none placeholder:text-white/40"
                />
                <button 
                  onClick={handleShare}
                  disabled={isSharing || !shareRecipient}
                  className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-xl disabled:opacity-20"
                >
                  SYNC
                </button>
              </div>

              {/* METADATA */}
              <div className="flex items-center justify-between px-4 pt-2">
                 <span className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Snapshot: {getTimeAgo(analysis.timestamp)}</span>
                 {analysis.groundingSources.length > 0 && (
                   <a href={analysis.groundingSources[0].uri} target="_blank" className="text-[8px] font-black text-indigo-400/40 uppercase tracking-widest flex items-center">
                     <i className="fas fa-check-double mr-1 text-[7px]"></i> Verified Live
                   </a>
                 )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-3xl font-black text-white tracking-tighter px-2">Vault</h2>
          {inbox.length === 0 ? (
            <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] text-zinc-700">
              <i className="fas fa-inbox text-4xl mb-4 opacity-10"></i>
              <p className="font-black uppercase tracking-[0.3em] text-[10px]">Empty Inbox</p>
            </div>
          ) : (
            <div className="space-y-4">
              {inbox.map((snap) => (
                <div key={snap.id} className="glass-card p-6 rounded-[2.5rem] border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-black text-white text-sm">@{snap.from}</span>
                    <span className="text-[9px] font-black text-zinc-600 uppercase">{getTimeAgo(snap.sentAt)}</span>
                  </div>
                  <div className="bg-black/40 p-4 rounded-2xl mb-4">
                    <p className="font-black text-white text-sm truncate">{snap.data.destination}</p>
                  </div>
                  <button 
                    onClick={() => { setAnalysis(snap.data); setActiveTab('planner'); }}
                    className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest"
                  >
                    Load Snapshot
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

export default App;