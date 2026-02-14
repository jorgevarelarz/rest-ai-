import React, { useState, useRef, useEffect } from 'react';
import { RestaurantConfig, ChatMessage, AvailabilityStatus, AssistantParsedResponse, ReservationState, ReservationContext } from './types';
import { DEFAULT_CONFIG } from './constants';
import { generateResponse } from './services/geminiService';
import { ReservationEngine } from './services/reservations/engine';
import { ReservationRepository } from './services/reservations/repository';
import { RestaurantRepository } from './services/restaurants/repository';
import { RestaurantConfigRepository } from './services/restaurants/configRepository';
import ConfigPanel from './components/ConfigPanel';
import DebugPanel from './components/DebugPanel';
import ChatBubble from './components/ChatBubble';
import OwnerPanel from './src/owner/OwnerPanel';
import OwnerLogin from './src/owner/OwnerLogin';
import { ownerLogin, ownerLogout, ownerSession } from './services/auth/ownerAuth';

const getRestaurantIdFromHash = (): string | null => {
  const h = window.location.hash || "";
  // Support: #rid=<uuid>
  const m = h.match(/(?:^|[?#&])rid=([^&]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  return null;
};

const isOwnerHashRoute = (): boolean => {
  const h = window.location.hash || "";
  return h.startsWith("#/owner");
};

function getApiKey(): string {
  const viteKey = (import.meta as any)?.env?.VITE_GEMINI_API_KEY;
  const legacyApiKey = (process as any)?.env?.API_KEY;
  const legacyGeminiKey = (process as any)?.env?.GEMINI_API_KEY;
  return (viteKey || legacyApiKey || legacyGeminiKey || "").trim();
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Error desconocido.";
  if (error instanceof Error) return error.message || "Error desconocido.";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Error desconocido.";
  }
}

const App: React.FC = () => {
  // --- State ---
  const [restaurantId, setRestaurantId] = useState<string>(() => {
    return localStorage.getItem("resto_bot_active_restaurant") || "";
  });
  const [config, setConfig] = useState<RestaurantConfig>(DEFAULT_CONFIG);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityStatus>('unknown');
  const [suggestedAlternatives, setSuggestedAlternatives] = useState<{ date: string; time: string }[]>([]);
  
  // Conversation Flow State
  const [reservationState, setReservationState] = useState<ReservationState>({
    step: 'idle',
    date: null,
    time: null,
    party_size: null,
    name: null,
    notes: null,
    pendingAction: null
  });

  // Client Context State (simulating identifying user by phone)
  const [reservationContext, setReservationContext] = useState<ReservationContext>({
    hasActiveReservation: false,
    activeReservationCount: 0,
    simulatedUserPhone: '+34600000000' // Default test phone
  });

  // UI State
  const [showConfig, setShowConfig] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isOwnerRoute, setIsOwnerRoute] = useState<boolean>(() => isOwnerHashRoute());
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(false);
  const [isOwnerAuthLoading, setIsOwnerAuthLoading] = useState<boolean>(true);
  
  // Last parsed data from assistant to show in DebugPanel
  const [lastParsedData, setLastParsedData] = useState<AssistantParsedResponse | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Bootstrap default tenant + load current tenant config
  useEffect(() => {
    const def = RestaurantRepository.ensureDefaultRestaurant();
    const stored = localStorage.getItem("resto_bot_active_restaurant");
    const fromHash = getRestaurantIdFromHash();
    const initialId =
      (fromHash && RestaurantRepository.getById(fromHash) ? fromHash : null) ??
      (stored && RestaurantRepository.getById(stored) ? stored : def.id);
    setRestaurantId(initialId);
  }, []); 

  // Keep route and restaurant id in sync with hash.
  useEffect(() => {
    const onHashChange = () => {
      setIsOwnerRoute(isOwnerHashRoute());
      const fromHash = getRestaurantIdFromHash();
      if (fromHash && RestaurantRepository.getById(fromHash)) {
        setRestaurantId(fromHash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Persist config changes per tenant
  useEffect(() => {
    if (!restaurantId) return;
    if (!config?.restaurant_id) return;
    if (config.restaurant_id !== restaurantId) return;
    RestaurantConfigRepository.upsert(config);
  }, [restaurantId, config]);

  // Keep Restaurant model name synced with config.name (prompt uses Restaurant.name as tenant identity).
  useEffect(() => {
    if (!restaurantId) return;
    if (!config?.restaurant_id) return;
    if (config.restaurant_id !== restaurantId) return;
    RestaurantRepository.updateRestaurant(config.restaurant_id, { name: config.name });
  }, [restaurantId, config?.restaurant_id, config?.name]);

  // When tenant changes: reset conversation state and refresh identity stats
  useEffect(() => {
    if (!restaurantId) return;
    localStorage.setItem("resto_bot_active_restaurant", restaurantId);
    const rid = encodeURIComponent(restaurantId);
    const next = isOwnerHashRoute() ? `#/owner?rid=${rid}` : `#/?rid=${rid}`;
    if (window.location.hash !== next) window.location.hash = next;
    const cfg = RestaurantConfigRepository.get(restaurantId);
    setConfig(cfg);

    setAvailability("unknown");
    setSuggestedAlternatives([]);
    setLastParsedData(null);
    setReservationState({
      step: "idle",
      date: null,
      time: null,
      party_size: null,
      name: null,
      notes: null,
      pendingAction: null
    });

    const stats = ReservationEngine.getStats(restaurantId, reservationContext.simulatedUserPhone);
    setReservationContext(prev => ({
      ...prev,
      hasActiveReservation: stats.hasActive,
      activeReservationCount: stats.count
    }));

    const initialMsg: ChatMessage = {
      id: `init-${restaurantId}`,
      role: 'model',
      text: `Hola 👋 Soy el asistente de reservas. Puedo reservar, cambiar o cancelar mesas.`,
      timestamp: Date.now(),
    };
    setMessages([initialMsg]);
  }, [restaurantId]); 

  const openOwnerPage = () => {
    if (!restaurantId) return;
    window.location.hash = `#/owner?rid=${encodeURIComponent(restaurantId)}`;
  };

  const openChatPage = () => {
    if (!restaurantId) return;
    window.location.hash = `#/?rid=${encodeURIComponent(restaurantId)}`;
  };

  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      if (!isOwnerRoute) {
        setIsOwnerAuthLoading(false);
        return;
      }
      setIsOwnerAuthLoading(true);
      const session = await ownerSession();
      if (cancelled) return;
      setIsOwnerAuthenticated(Boolean(session.authenticated));
      setIsOwnerAuthLoading(false);
    };
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [isOwnerRoute]);

  const handleOwnerLogin = async (username: string, password: string): Promise<boolean> => {
    const ok = await ownerLogin(username, password);
    setIsOwnerAuthenticated(ok);
    return ok;
  };

  const handleOwnerLogout = async () => {
    await ownerLogout();
    setIsOwnerAuthenticated(false);
  };


  // --- Handlers ---

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      // API Key check
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("API Key no encontrada. Usa VITE_GEMINI_API_KEY en .env.local y reinicia npm run dev.");
      }

      // 1. GENERATE "PLAN" (parse + backend_action)
      const planResponse = await generateResponse({
        restaurant_id: restaurantId,
        history: nextHistory,
        lastUserMessage: userMsg.text,
        availabilityStatus: availability,
        suggestedAlternatives: suggestedAlternatives,
        apiKey: apiKey,
        reservationState: reservationState,
        reservationContext: reservationContext
      });

      let finalResponse = planResponse;
      let parsedData = planResponse.parsedData;

      if (parsedData) {
        setLastParsedData(parsedData);

        const newData = parsedData.reservation;
        const parsedIntent = parsedData.intent;
        const action = parsedData.backend_action;

        // 2. EXECUTE ENGINE ACTION (REAL BACKEND SIMULATION)
        // Handle Identity Logic for Modify/Cancel if ID is missing but we know the user
        if ((action.type === 'update_reservation' || action.type === 'cancel_reservation') && !action.payload.reservation_id) {
          const activeRes = ReservationRepository.getByPhone(restaurantId, reservationContext.simulatedUserPhone);
          if (activeRes.length === 1) {
            action.payload.reservation_id = activeRes[0].id;
          }
        }

        // 3. UPDATE FRONTEND STATE (derive nextState locally so we can pass it to the model)
        const nextState: ReservationState = {
          ...reservationState,
          date: newData.date || reservationState.date,
          time: newData.time || reservationState.time,
          party_size: newData.party_size || reservationState.party_size,
          name: newData.name || reservationState.name,
          notes: newData.notes || reservationState.notes,
          pendingAction: reservationState.pendingAction
        };

        if (action.type === 'create_reservation' || action.type === 'update_reservation' || action.type === 'cancel_reservation') {
          nextState.pendingAction = null;
        } else if (parsedIntent === 'cancel') {
          nextState.pendingAction = { type: 'cancel_reservation' };
        } else if (parsedIntent === 'modify') {
          nextState.pendingAction = { type: 'update_reservation' };
        } else if (parsedIntent === 'reserve' || parsedIntent === 'info' || parsedIntent === 'unknown') {
          nextState.pendingAction = null;
        }

        if (!nextState.date) nextState.step = 'collect_date';
        else if (!nextState.party_size) nextState.step = 'collect_party';
        else if (!nextState.time) nextState.step = 'collect_time';
        else if (!nextState.name) nextState.step = 'collect_name';
        else nextState.step = 'confirming';

        if (['create_reservation', 'update_reservation', 'cancel_reservation'].includes(action.type)) {
          nextState.step = 'done';
        }

        setReservationState(nextState);

        // If we have a backend action, run it and then generate a FINAL user-facing response
        if (action.type !== 'none') {
          const result = ReservationEngine.execute(action, {
            restaurant_id: restaurantId,
            phone: reservationContext.simulatedUserPhone
          });

          const nextAvailability: AvailabilityStatus =
            (result.availability as AvailabilityStatus | undefined) ??
            ((action.type === 'update_reservation' || action.type === 'cancel_reservation') ? 'unknown' : availability);

          setAvailability(nextAvailability);
          setSuggestedAlternatives(action.type === 'check_availability' ? (result.alternatives ?? []) : []);

          // Refresh Context Stats after a write operation (create/update/cancel)
          let nextContext = reservationContext;
          if (action.type === 'create_reservation' || action.type === 'update_reservation' || action.type === 'cancel_reservation') {
            const stats = ReservationEngine.getStats(restaurantId, reservationContext.simulatedUserPhone);
            nextContext = {
              ...reservationContext,
              hasActiveReservation: stats.hasActive,
              activeReservationCount: stats.count
            };
            setReservationContext(nextContext);
          }

          finalResponse = await generateResponse({
            restaurant_id: restaurantId,
            history: nextHistory,
            lastUserMessage: userMsg.text,
            availabilityStatus: nextAvailability,
            suggestedAlternatives: action.type === 'check_availability' ? (result.alternatives ?? []) : [],
            backendResult: result,
            lockBackendAction: true,
            apiKey: apiKey,
            reservationState: nextState,
            reservationContext: nextContext
          });
        }
      }

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: finalResponse.text,
        raw: finalResponse.raw,
        parsedData: finalResponse.parsedData,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, modelMsg]);

    } catch (error) {
      console.error(error);
      const reason = getErrorMessage(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Lo siento, falló la conexión con el motor de IA. Detalle: ${reason}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isOwnerRoute) {
    if (isOwnerAuthLoading) {
      return <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-600">Cargando...</div>;
    }
    if (!isOwnerAuthenticated) {
      return <OwnerLogin onLogin={handleOwnerLogin} />;
    }
    return (
      <div className="h-full w-full bg-gray-100 overflow-hidden">
        <OwnerPanel
          isOpen={true}
          standalone={true}
          onClose={openChatPage}
          onLogout={handleOwnerLogout}
          activeRestaurantId={restaurantId}
          onSelectRestaurantId={setRestaurantId}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full bg-[#E5DDD5] overflow-hidden">
      
      {/* Background Pattern Overlay */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}>
      </div>

      {/* --- Main Content Area --- */}
      <div className="relative z-10 flex flex-col w-full h-full max-w-4xl mx-auto shadow-2xl bg-[#efe7dd]">
        
        {/* Header */}
        <header className="flex-none bg-[#008069] text-white px-4 py-3 flex items-center justify-between shadow-md z-20">
          <div className="flex items-center space-x-3">
             <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                <span className="text-2xl">🤖</span>
             </div>
             <div>
               <h1 className="font-semibold text-lg leading-tight truncate max-w-[200px] sm:max-w-md">
                 {config.name}
               </h1>
               <p className="text-xs text-green-100/80 truncate">
                 {isLoading ? 'Escribiendo...' : 'En línea'}
               </p>
             </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={openOwnerPage}
              className="p-2 hover:bg-white/10 rounded-full transition"
              title="Ir a panel del restaurante"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z"></path>
              </svg>
            </button>
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 hover:bg-white/10 rounded-full transition"
              title="Settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="p-2 hover:bg-white/10 rounded-full transition"
              title="System Status"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 scrollbar-hide bg-transparent">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
           {/* Loading Indicator */}
           {isLoading && (
              <div className="flex justify-start w-full mb-4">
                <div className="bg-white px-4 py-3 rounded-lg rounded-tl-none shadow-sm flex space-x-1 items-center">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
           )}
          <div ref={messagesEndRef} />
        </main>

        {/* Input Area */}
        <footer className="flex-none bg-[#f0f2f5] p-3 px-4 flex items-end space-x-2 z-20">
            <button className="p-2 mb-1 text-gray-500 hover:text-gray-700 transition">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </button>
            
            <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center p-2 mb-1">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje..."
                  className="w-full max-h-32 bg-transparent border-none focus:ring-0 resize-none outline-none text-gray-800 placeholder-gray-500 overflow-y-auto"
                  rows={1}
                  style={{ minHeight: '24px' }}
                />
            </div>

            <button 
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className={`p-3 rounded-full mb-1 transition shadow-sm ${
                !inputText.trim() || isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-[#008069] text-white hover:bg-[#006d59]'
              }`}
            >
              <svg className="w-5 h-5 transform rotate-90 translate-x-[1px]" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
            </button>
        </footer>

      </div>

      {/* Side Panels */}
      <ConfigPanel 
        config={config} 
        setConfig={setConfig} 
        isOpen={showConfig} 
        onClose={() => setShowConfig(false)} 
      />
      <DebugPanel 
        parsedData={lastParsedData}
        availability={availability}
        setAvailability={setAvailability}
        reservationState={reservationState}
        restaurantId={restaurantId}
        reservationContext={reservationContext}
        setReservationContext={setReservationContext}
        isOpen={showDebug} 
        onClose={() => setShowDebug(false)} 
      />
      {/* Overlay when panel is open on mobile */}
      {(showConfig || showDebug) && (
        <div 
          className="absolute inset-0 bg-black/50 z-40 sm:hidden"
          onClick={() => { setShowConfig(false); setShowDebug(false); }}
        ></div>
      )}

    </div>
  );
};

export default App;
