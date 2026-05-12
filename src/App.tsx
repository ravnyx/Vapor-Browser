import React, { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  Lock, 
  RefreshCcw, 
  Plus, 
  X, 
  ArrowLeft, 
  ArrowRight,
  Search,
  Shield,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatUrl = (input: string) => {
  let url = input.trim();
  if (!url) return '';
  // If no space and has a dot, treat as URL
  if (!url.includes(' ') && url.includes('.')) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'https://' + url;
    }
    return url;
  }
  // Otherwise search DuckDuckGo
  return `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(url)}`;
};

type TabData = {
  id: string;
  history: string[]; // Stack of actual resolved URLs (e.g., https://google.com)
  currentIndex: number;
  inputValue: string; // What the user types/sees in the URL bar
  title: string;
};

export default function App() {
  const [isPrivate, setIsPrivate] = useState(false);
  
  const createNewTab = (): TabData => ({
    id: generateId(),
    history: ['https://lite.duckduckgo.com/lite/'],
    currentIndex: 0,
    inputValue: 'duckduckgo.com',
    title: 'DuckDuckGo',
  });

  const [tabs, setTabs] = useState<TabData[]>([createNewTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  // Get active tab object safely
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Wipes all tabs when switching modes (hard reset for absolute privacy)
  useEffect(() => {
    const newTab = createNewTab();
    setTabs([newTab]);
    setActiveTabId(newTab.id);
  }, [isPrivate]);

  // Listen for iframe navigations passed through the proxy
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'BROWSER_NAVREQ') {
        const { url, title } = e.data;
        
        // Find which iframe sent the message
        let tabId = '';
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            if (iframe.contentWindow === e.source) {
                tabId = iframe.id.replace('iframe-', '');
            }
        });

        if (!tabId) return;

        setTabs(prevTabs => prevTabs.map(tab => {
          if (tab.id !== tabId) return tab;
          
          // If the proxy actually navigated to the same URL we are already on, just update title
          if (tab.history[tab.currentIndex] === url) {
             return { ...tab, title: title || tab.title };
          }
          
          // Otherwise, push new URL to history
          const newHistory = tab.history.slice(0, tab.currentIndex + 1);
          newHistory.push(url);
          
          return {
            ...tab,
            history: newHistory,
            currentIndex: newHistory.length - 1,
            inputValue: url,
            title: title || new URL(url).hostname
          };
        }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Actions
  const handleAddTab = () => {
    const t = createNewTab();
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
  };

  const handleCloseTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation(); // prevent selecting the closing tab
    setTabs(prev => {
      if (prev.length <= 1) return [createNewTab()]; // Don't let it be empty
      const filtered = prev.filter(t => t.id !== idToClose);
      // If we closed the active tab, switch to the last one
      if (activeTabId === idToClose) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const navigateTab = (id: string, url: string) => {
    const formatted = formatUrl(url);
    if (!formatted) return;

    setTabs(prev => prev.map(tab => {
      if (tab.id !== id) return tab;
      
      // Prevent duplicating the exact same url in history if user just hits enter on current URL
      if (tab.history[tab.currentIndex] === formatted) {
         return tab;
      }
      
      const newHistory = tab.history.slice(0, tab.currentIndex + 1);
      newHistory.push(formatted);
      return {
        ...tab,
        history: newHistory,
        currentIndex: newHistory.length - 1,
        inputValue: formatted, // Show full url when navigated
        title: 'Loading...'
      };
    }));
  };

  const handleBack = () => {
    if (activeTab.currentIndex > 0) {
      setTabs(prev => prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          currentIndex: tab.currentIndex - 1,
          inputValue: tab.history[tab.currentIndex - 1]
        };
      }));
    }
  };

  const handleForward = () => {
    if (activeTab.currentIndex < activeTab.history.length - 1) {
      setTabs(prev => prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          currentIndex: tab.currentIndex + 1,
          inputValue: tab.history[tab.currentIndex + 1]
        };
      }));
    }
  };

  const handleRefresh = () => {
    // A trick to force iframe reload is to slightly modify the proxy URL key, but for now 
    // simply updating state with a clone triggers nothing if the URL is identical.
    // Instead we can temporarily clear the URL and re-set it, or rely on normal browser refresh.
    // We'll just append a random hash to the proxy request to bust the cache iframe side
    setTabs(prev => prev.map(tab => {
       if (tab.id !== activeTabId) return tab;
       return { ...tab, title: 'Refreshing...' };
    }));
    const iframe = document.getElementById(`iframe-${activeTab.id}`) as HTMLIFrameElement;
    if (iframe) {
        iframe.src = iframe.src; // Trigger real reload
    }
  };

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTab(activeTabId, activeTab.inputValue);
  };

  const changeInputValue = (val: string) => {
    setTabs(prev => prev.map(tab => tab.id === activeTabId ? { ...tab, inputValue: val } : tab));
  };


  // Geometric Balance Theme Constants
  const theme = {
    bg: 'bg-slate-900', // Main window bg
    chrome: 'bg-slate-800', // Basic header
    text: 'text-slate-100',
    tabBarBg: 'bg-slate-800',
    tabInactiveBg: 'bg-slate-900 border-t border-x border-slate-700 opacity-60 hover:opacity-80',
    tabInactiveText: 'text-slate-400',
    tabActiveBg: 'bg-slate-700 border-t border-x border-slate-600',
    tabActiveText: 'text-slate-100',
    navBg: 'bg-slate-900 border-b border-slate-800 shadow-xl',
    inputContainer: 'bg-slate-800 border-slate-700 rounded-full h-9',
    inputBg: 'bg-transparent text-slate-200 placeholder-slate-500 border-none outline-none focus:ring-0',
    iconColor: 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 cursor-pointer',
    btnPrimary: isPrivate ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-inner shadow-indigo-200/20 border border-indigo-400' : 'bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200',
    contentBg: 'bg-slate-50'
  };

  return (
    <div className={`flex flex-col h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${theme.bg}`}>
      
      {/* Browser Frame Header */}
      <div className={`h-10 ${theme.chrome} flex items-center px-4 space-x-4 border-b border-slate-700`}>
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-rose-500"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
        </div>
        <div className="flex-1 flex justify-center">
          <span className="text-xs text-slate-400 font-medium tracking-widest uppercase">
            Vapor Browser v1.0 • {isPrivate ? 'Private Session' : 'Standard Session'}
          </span>
        </div>
        <div className="w-12 flex justify-end">
          {/* Toggle Private Mode Button inside header for cleanliness */}
          <button 
            onClick={() => setIsPrivate(!isPrivate)}
            className={`p-1.5 rounded-full flex items-center justify-center transition-colors ${theme.btnPrimary}`}
            title="Toggle Private Mode"
          >
            {isPrivate ? <EyeOff size={14} /> : <Shield size={14} />}
          </button>
        </div>
      </div>

      {/* Top Chrome: Tabs */}
      <div className={`h-12 ${theme.tabBarBg} flex items-end px-2 space-x-1 select-none`}>
        <div className="px-2" /> {/* Small padding before tabs */}
        
        {tabs.map((tab) => (
          <div 
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`group relative flex items-center h-9 px-4 rounded-t-lg cursor-pointer transition-all ${
              activeTabId === tab.id ? theme.tabActiveBg : theme.tabInactiveBg
            } w-48`}
          >
            <div className={`w-4 h-4 rounded-sm flex items-center justify-center text-[10px] text-white flex-shrink-0 ${
              activeTabId === tab.id ? 'bg-indigo-500' : 'bg-slate-600'
            }`}>
              {tab.title ? tab.title.charAt(0).toUpperCase() : 'G'}
            </div>
            
            <div className={`flex-1 min-w-0 pl-3 flex items-center ${
              activeTabId === tab.id ? theme.tabActiveText : theme.tabInactiveText
            }`}>
              <span className="text-xs truncate">{tab.title || tab.inputValue || 'New Tab'}</span>
            </div>
            
            <button 
              onClick={(e) => handleCloseTab(e, tab.id)}
              className={`ml-2 text-lg leading-none transition-colors ${
                activeTabId === tab.id ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              &times;
            </button>
          </div>
        ))}
        
        <button 
          onClick={handleAddTab}
          className={`mb-2 ml-2 p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors`}
          title="New Tab"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Top Chrome: Navigation Bar & Controls */}
      <div className={`h-14 ${theme.navBg} flex items-center px-4 space-x-4 z-10`}>
        <div className="flex space-x-4 text-slate-400">
          <button 
            onClick={handleBack} 
            disabled={activeTab.currentIndex === 0}
            className={`transition-colors p-1 rounded hover:bg-slate-800 ${activeTab.currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : theme.iconColor}`}
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <button 
            onClick={handleForward}
            disabled={activeTab.currentIndex === activeTab.history.length - 1}
            className={`transition-colors p-1 rounded hover:bg-slate-800 ${activeTab.currentIndex === activeTab.history.length - 1 ? 'opacity-30 cursor-not-allowed' : theme.iconColor}`}
          >
            <ArrowRight size={20} strokeWidth={2} />
          </button>
          <button 
            onClick={handleRefresh}
            className={`transition-colors p-1 rounded hover:bg-slate-800 ${theme.iconColor}`}
          >
            <RefreshCcw size={20} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmitUrl} className={`flex-1 flex items-center px-4 space-x-3 border ${theme.inputContainer}`}>
          <div className="flex items-center text-indigo-400 flex-shrink-0">
            {isPrivate ? <Lock size={14} className="opacity-80" /> : <Globe size={14} className="opacity-80" />}
            <span className="ml-1 text-[10px] uppercase font-bold tracking-wider">{isPrivate ? 'Secure' : 'Standard'}</span>
          </div>
          <input 
            type="text"
            value={activeTab.inputValue}
            onChange={(e) => changeInputValue(e.target.value)}
            className={`flex-1 text-sm ${theme.inputBg}`}
            placeholder="Search the web loosely..."
            spellCheck={false}
          />
        </form>
      </div>

      {/* Main Content Area (Iframes) */}
      <div className={`flex-1 relative overflow-hidden ${theme.contentBg}`}>
        {isPrivate && (
           <div className="absolute top-0 right-0 p-4 text-xs font-mono text-purple-400 opacity-50 pointer-events-none">
              Cookies disabled • Local proxy active
           </div>
        )}
        
        {tabs.map(tab => {
          const currentUrl = tab.history[tab.currentIndex];
          // We route everything through our local proxy using the wildcard path
          let proxySrc = '';
          try {
             const u = new URL(currentUrl);
             proxySrc = `/proxy/${u.protocol.replace(':','')}/${u.host}${u.pathname}${u.search}`;
          } catch(e) {
             proxySrc = '';
          }

          return (
            <iframe
              key={tab.id}
              id={`iframe-${tab.id}`}
              src={proxySrc}
              className={`absolute inset-0 w-full h-full border-none transition-opacity duration-200 ${
                activeTabId === tab.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
              title={`Tab ${tab.id}`}
            />
          );
        })}
      </div>
      
    </div>
  );
}
