import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Calendar, 
  MapPin, 
  Car, 
  Clock, 
  Send, 
  User, 
  Sparkles, 
  LogOut, 
  Link2, 
  Navigation, 
  Check, 
  AlertTriangle, 
  Bell, 
  Trash2, 
  RefreshCw,
  Info,
  GripVertical,
  Sun,
  Moon,
  MessageSquare,
  Settings,
  Mic,
  Volume2,
  VolumeX,
  Heart,
  Gift,
  CheckSquare,
  Users,
  Phone,
  Mail,
  Cake
} from 'lucide-react';

const parseBold = (text) => {
  return text.split('**').map((chunk, cIdx) => {
    return cIdx % 2 === 1 ? <strong key={`bold-${cIdx}`}>{chunk}</strong> : chunk;
  });
};

const renderFormattedMessage = (text) => {
  if (!text) return null;
  return text.split('\n').map((paragraph, pIdx) => {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    const parseRawUrlsAndBold = (subText) => {
      const urlRegex = /(https?:\/\/[^\s()]+)/g;
      const subParts = [];
      let subLastIndex = 0;
      let urlMatch;
      
      while ((urlMatch = urlRegex.exec(subText)) !== null) {
        const matchIndex = urlMatch.index;
        const textBefore = subText.substring(subLastIndex, matchIndex);
        
        if (textBefore) {
          subParts.push(...parseBold(textBefore));
        }
        
        let url = urlMatch[1];
        if (url.endsWith('.') || url.endsWith(',') || url.endsWith(')')) {
          url = url.substring(0, url.length - 1);
        }
        
        subParts.push(
          <a 
            key={`raw-url-${matchIndex}`} 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: 'var(--accent-hover)', textDecoration: 'underline', fontWeight: '600', cursor: 'pointer' }}
          >
            {url}
          </a>
        );
        
        subLastIndex = urlRegex.lastIndex;
      }
      
      const textAfter = subText.substring(subLastIndex);
      if (textAfter) {
        subParts.push(...parseBold(textAfter));
      }
      
      return subParts;
    };
    
    while ((match = linkRegex.exec(paragraph)) !== null) {
      const matchIndex = match.index;
      const textBefore = paragraph.substring(lastIndex, matchIndex);
      
      if (textBefore) {
        parts.push(...parseRawUrlsAndBold(textBefore));
      }
      
      const linkText = match[1];
      const linkUrl = match[2];
      
      parts.push(
        <a 
          key={`link-${matchIndex}`} 
          href={linkUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ color: 'var(--accent-hover)', textDecoration: 'underline', fontWeight: '600', cursor: 'pointer' }}
        >
          {linkText}
        </a>
      );
      
      lastIndex = linkRegex.lastIndex;
    }
    
    const textAfter = paragraph.substring(lastIndex);
    if (textAfter) {
      parts.push(...parseRawUrlsAndBold(textAfter));
    }
    
    return <p key={pIdx}>{parts}</p>;
  });
};

const getBackendUrl = () => {
  const saved = localStorage.getItem('backend_url');
  if (saved) return saved;
  
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  if (
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.startsWith('192.168.') || 
    hostname.startsWith('10.') || 
    hostname.startsWith('172.')
  ) {
    return `${protocol}//${hostname}:5000`;
  }
  
  return 'https://scheduleai-hz68.onrender.com';
};

const BACKEND_URL = getBackendUrl();

function App() {
  const [backendUrlInput, setBackendUrlInput] = useState(() => {
    return localStorage.getItem('backend_url') || BACKEND_URL;
  });
  const [connectionTestStatus, setConnectionTestStatus] = useState('idle');

  const testConnection = async (urlToTest) => {
    setConnectionTestStatus('testing');
    try {
      const normalizedUrl = (urlToTest || BACKEND_URL).trim().replace(/\/$/, '');
      const res = await fetch(`${normalizedUrl}/api/auth/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        setConnectionTestStatus('success');
      } else {
        setConnectionTestStatus('failed');
      }
    } catch (err) {
      console.error('Connection test failed:', err);
      setConnectionTestStatus('failed');
    }
  };
  const [status, setStatus] = useState({ isConfigured: false, isConnected: false, mode: 'mock' });
  const [preferences, setPreferences] = useState({
    origin: '',
    homeAddress: '',
    workAddress: '',
    transportMode: 'driving',
    prepTimeMinutes: 60,
    leadTimeMinutes: 15,
    advanceArrivalMinutes: 15,
    ttsMode: 'gemini',
    ttsVoice: 'Puck',
    hobbies: '',
    birthdayAlerts: ''
  });
  
  const [calculations, setCalculations] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isEditingPrefs, setIsEditingPrefs] = useState(false);
  const [modelHealth, setModelHealth] = useState({});
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [localModels, setLocalModels] = useState([]);
  const [showCharacteristicsModal, setShowCharacteristicsModal] = useState(false);
  const [currentActiveModel, setCurrentActiveModel] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [canDrag, setCanDrag] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeSecondTab, setActiveSecondTab] = useState('agenda');
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskEnergy, setNewTaskEnergy] = useState('medium');
  const [currentSpeakingText, setCurrentSpeakingText] = useState('');

  const chatEndRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    return localStorage.getItem('voice_enabled') === 'true';
  });
  const [isListening, setIsListening] = useState(false);
  const [audioElement, setAudioElement] = useState(null);
  const recognitionRef = useRef(null);
  const handleSendChatRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('voice_enabled', isVoiceEnabled);
  }, [isVoiceEnabled]);

  // Keep ref up to date to prevent stale closures in recognition event handlers
  useEffect(() => {
    handleSendChatRef.current = handleSendChat;
  });

  const [browserVoices, setBrowserVoices] = useState([]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      // Filter for Portuguese voices (pt-BR or pt-PT)
      const ptVoices = allVoices.filter(v => 
        v.lang.toLowerCase().includes('pt-br') || 
        v.lang.toLowerCase().includes('pt_br') || 
        v.lang.toLowerCase().includes('pt-pt') || 
        v.lang.toLowerCase().includes('pt_pt')
      );
      setBrowserVoices(ptVoices);
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const speakBrowser = (text, voiceName) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    
    const allVoices = window.speechSynthesis.getVoices();
    const selectedVoice = allVoices.find(v => v.name === voiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      // Fallback to first pt-BR voice
      const ptVoice = allVoices.find(v => v.lang.toLowerCase().includes('pt-br') || v.lang.toLowerCase().includes('pt_br'));
      if (ptVoice) utterance.voice = ptVoice;
    }
    
    utterance.onstart = () => {
      setIsPlayingAudio(true);
      setCurrentSpeakingText(text);
    };
    
    utterance.onend = () => {
      setIsPlayingAudio(false);
      setCurrentSpeakingText('');
    };
    
    utterance.onerror = () => {
      setIsPlayingAudio(false);
      setCurrentSpeakingText('');
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const speakText = async (text) => {
    if (!text) return;
    
    // Stop currently playing audio if any
    if (audioElement) {
      try {
        audioElement.pause();
      } catch (e) {}
    }
    // Cancel browser synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    setIsPlayingAudio(false);
    setCurrentSpeakingText('');

    if (preferences.ttsMode === 'browser') {
      speakBrowser(text, preferences.ttsVoice);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) {
        throw new Error('TTS Endpoint responded with error');
      }

      const data = await res.json();
      if (data.audio) {
        const audioUrl = `data:audio/wav;base64,${data.audio}`;
        const newAudio = new Audio(audioUrl);
        newAudio.onplay = () => {
          setIsPlayingAudio(true);
          setCurrentSpeakingText(text);
        };
        newAudio.onended = () => {
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        newAudio.onpause = () => {
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        setAudioElement(newAudio);
        newAudio.play().catch(e => {
          console.warn('[TTS] Autoplay blocked, falling back to Web Speech API:', e);
          speakBrowser(text, preferences.ttsVoice);
        });
      } else {
        throw new Error('No audio in response');
      }
    } catch (err) {
      console.warn('[TTS] Gemini TTS failed, falling back to Browser Web Speech API:', err.message);
      speakBrowser(text, preferences.ttsVoice);
    }
  };

  const stopSpeaking = () => {
    if (audioElement) {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
      } catch (e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setCurrentSpeakingText('');
  };

  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const handleTestVoice = async () => {
    const testText = "Olá! Este é um teste da voz selecionada no ScheduleAI.";
    setIsTestingVoice(true);
    
    if (audioElement) {
      try {
        audioElement.pause();
      } catch (e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (preferences.ttsMode === 'browser') {
      speakBrowser(testText, preferences.ttsVoice);
      setIsTestingVoice(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice: preferences.ttsVoice })
      });

      if (!res.ok) {
        throw new Error('TTS test failed');
      }

      const data = await res.json();
      if (data.audio) {
        const audioUrl = `data:audio/wav;base64,${data.audio}`;
        const newAudio = new Audio(audioUrl);
        newAudio.onplay = () => {
          setIsPlayingAudio(true);
          setCurrentSpeakingText(testText);
        };
        newAudio.onended = () => {
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        newAudio.onpause = () => {
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        setAudioElement(newAudio);
        newAudio.play().catch(e => {
          console.warn('[TTS Test] Autoplay blocked, falling back to browser speak:', e);
          speakBrowser(testText, preferences.ttsVoice);
        });
      } else {
        throw new Error('No audio returned');
      }
    } catch (err) {
      console.warn('[TTS Test] Gemini test failed, falling back to Browser TTS:', err.message);
      speakBrowser(testText, preferences.ttsVoice);
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Speech Recognition Web API (STT) setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'pt-BR';

      rec.onstart = () => {
        setIsListening(true);
        // Play low chime sound to indicate listening
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 600;
          gain.gain.setValueAtTime(0.03, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch (e) {}
      };

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.trim() && handleSendChatRef.current) {
          handleSendChatRef.current(transcript, true);
        }
      };

      rec.onerror = (e) => {
        console.warn('[STT] Speech recognition error:', e.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const startListening = (e) => {
    e.preventDefault();
    if (!recognitionRef.current) {
      alert('Seu navegador não suporta reconhecimento de voz (Speech-to-Text). Use o Google Chrome ou Microsoft Edge.');
      return;
    }

    if (audioElement) {
      try {
        audioElement.pause();
      } catch (err) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      recognitionRef.current.start();
    } catch (err) {
      console.warn('[STT] Speech recognition already running or starting:', err.message);
    }
  };

  const stopListening = (e) => {
    e?.preventDefault();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn('[STT] Error stopping speech recognition:', err.message);
      }
    }
  };

  // Fetch models health status sequentially (to prevent VRAM overload)
  const fetchModelHealth = async () => {
    setIsCheckingHealth(true);
    const currentModels = preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'];
    
    // Create copy of current state
    const newState = { ...modelHealth };

    for (const model of currentModels) {
      // Set only this model as checking (blinking)
      newState[model] = { status: 'checking', message: 'Testando conexão e resposta...' };
      setModelHealth({ ...newState });

      try {
        const res = await fetch(`${BACKEND_URL}/api/models/health/${encodeURIComponent(model)}`);
        const data = await res.json();
        newState[model] = data;
        setModelHealth({ ...newState });
      } catch (err) {
        console.error(`Error checking model ${model}:`, err);
        newState[model] = { status: 'inactive', message: 'Falha ao obter diagnóstico do servidor.' };
        setModelHealth({ ...newState });
      }
    }
    setIsCheckingHealth(false);
  };

  // Play synthetic web audio chime
  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (freq, duration, startOffset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, ctx.currentTime + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration - 0.02);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startOffset);
        osc.stop(ctx.currentTime + startOffset + duration);
      };

      playTone(523.25, 0.2, 0); // C5
      playTone(659.25, 0.3, 0.15); // E5
    } catch (e) {
      console.warn('AudioContext failed:', e);
    }
  };

  // Fetch status and preferences
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/status`);
      const data = await res.json();
      setStatus(data.status);
      setPreferences(data.preferences);
      if (data.lastModelUsed) {
        setCurrentActiveModel(data.lastModelUsed);
      }

      // Fetch local Ollama models list
      let localModelsData = [];
      try {
        const localRes = await fetch(`${BACKEND_URL}/api/models/local`);
        localModelsData = await localRes.json();
        setLocalModels(localModelsData);
      } catch (localErr) {
        console.log('Error fetching local models:', localErr);
      }

      // Merge local models into priority list, keeping existing priority order
      const existingPriority = data.preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'];
      const mergedPriority = [...existingPriority];
      
      localModelsData.forEach(model => {
        if (!mergedPriority.includes(model)) {
          mergedPriority.push(model);
        }
      });

      setPreferences({
        ...data.preferences,
        modelPriority: mergedPriority
      });
      return data.status;
    } catch (err) {
      console.error('Error fetching auth status:', err);
      return null;
    }
  };

  // Auto-merge local models into preferences whenever preferences.modelPriority or localModels changes
  useEffect(() => {
    if (localModels.length === 0) return;
    const existingPriority = preferences.modelPriority || [];
    if (existingPriority.length === 0) return;

    let needsUpdate = false;
    const mergedPriority = [...existingPriority];

    localModels.forEach(model => {
      if (!mergedPriority.includes(model)) {
        mergedPriority.push(model);
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      setPreferences(prev => ({
        ...prev,
        modelPriority: mergedPriority
      }));
    }
  }, [preferences.modelPriority, localModels]);

  // Fetch tasks
  const fetchTasks = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tasks`);
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    }
  };

  // Helper to show custom toasts
  const addCustomToast = (title, message, type = 'info') => {
    const notif = {
      id: `notification-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date().toISOString()
    };
    setToasts(prev => [notif, ...prev]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== notif.id));
    }, 5000);
  };

  // Fetch contacts
  const fetchContacts = async () => {
    setIsLoadingContacts(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Toggle birthday alert status for a contact
  const handleToggleBirthdayAlert = async (contact) => {
    const name = contact.name;
    const currentAlerts = preferences.birthdayAlerts || '';
    const monitoredNames = currentAlerts.split(',').map(n => n.trim()).filter(Boolean);
    const isAlreadyMonitored = monitoredNames.some(n => n.toLowerCase() === name.toLowerCase());
    
    let updatedAlertsList;
    if (isAlreadyMonitored) {
      updatedAlertsList = monitoredNames.filter(n => n.toLowerCase() !== name.toLowerCase());
    } else {
      updatedAlertsList = [...monitoredNames, name];
    }
    
    const updatedAlertsString = updatedAlertsList.join(', ');
    const updatedPrefs = {
      ...preferences,
      birthdayAlerts: updatedAlertsString
    };
    
    setPreferences(updatedPrefs);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPrefs)
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
        addCustomToast('Sucesso', isAlreadyMonitored ? `Alerta de aniversário para ${name} desativado.` : `Alerta de aniversário para ${name} ativado!`, 'success');
      }
    } catch (err) {
      console.error('Error saving updated birthday alert preferences:', err);
      addCustomToast('Erro', 'Não foi possível salvar a preferência de alerta.', 'error');
    }
  };

  // Fetch event calculations
  const fetchTimeline = async () => {
    setIsLoadingTimeline(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/calendar/calculate`);
      const data = await res.json();
      setCalculations(data);
      // Fetch tasks as well to keep them synchronized
      await fetchTasks();
    } catch (err) {
      console.error('Error fetching timeline events:', err);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: newTaskTitle,
          deadline: newTaskDeadline || undefined,
          priority: newTaskPriority,
          requiredEnergy: newTaskEnergy
        })
      });
      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDeadline('');
        setNewTaskPriority('medium');
        setNewTaskEnergy('medium');
        fetchTasks();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const handleToggleTaskState = async (id, currentState) => {
    try {
      const newState = currentState === 'completed' ? 'planned' : 'completed';
      const res = await fetch(`${BACKEND_URL}/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tasks/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  // Connect Google account
  const connectGoogle = async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`${BACKEND_URL}/api/auth/url?origin=${encodeURIComponent(origin)}`);
      const data = await res.json();
      if (data.url) {
        // Redirect directly in the same tab to prevent browser pop-up blockers
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error connecting Google account:', err);
    }
  };

  const connectGoogleRedirect = async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`${BACKEND_URL}/api/auth/url?origin=${encodeURIComponent(origin)}`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error redirecting to Google account:', err);
    }
  };

  // Disconnect Google account
  const disconnectGoogle = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/disconnect`, { method: 'POST' });
      const data = await res.json();
      setStatus(data.status);
      fetchTimeline();
    } catch (err) {
      console.error('Error disconnecting Google:', err);
    }
  };

  // Move model priority up/down
  const moveModel = (index, direction) => {
    const updated = [...(preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= updated.length) return;
    
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    
    setPreferences({
      ...preferences,
      modelPriority: updated
    });
  };

  // Remove model from priority list
  const removeModel = (index) => {
    const updated = [...(preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'])];
    updated.splice(index, 1);
    setPreferences({
      ...preferences,
      modelPriority: updated
    });
  };

  // Drag and Drop handlers for model priority list (desktop support)
  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(sourceIndex) && sourceIndex !== index) {
      const list = [...(preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash'])];
      const draggedItem = list[sourceIndex];
      list.splice(sourceIndex, 1);
      list.splice(index, 0, draggedItem);
      setPreferences({
        ...preferences,
        modelPriority: list
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    setCanDrag(false);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setCanDrag(false);
  };

  // Save Preferences
  const handleSavePrefs = async (e) => {
    e.preventDefault();
    const oldUrl = (localStorage.getItem('backend_url') || 'http://localhost:5000').trim().replace(/\/$/, '');
    const newUrl = (backendUrlInput || '').trim().replace(/\/$/, '');
    
    if (newUrl !== oldUrl) {
      localStorage.setItem('backend_url', newUrl);
      window.location.reload();
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });
      const data = await res.json();
      setPreferences(data);
      setIsEditingPrefs(false);
      // Re-trigger timeline calculation to update routes & travel times
      fetchTimeline();
      fetchModelHealth();
    } catch (err) {
      console.error('Error saving preferences:', err);
    }
  };

  // Send Chat message to AI
  const handleSendChat = async (textToSend, isVoiceInput = false) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    if (!textToSend) setInputText('');
    
    // Add user message to history
    const newUserMsg = { sender: 'user', text };
    setChatHistory(prev => [...prev, newUserMsg]);
    setIsSendingChat(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10) // pass last 10 messages for context
        })
      });
      const data = await res.json();
      
      setChatHistory(prev => [...prev, { sender: 'assistant', text: data.text }]);
      if (data.modelUsed) {
        setCurrentActiveModel(data.modelUsed);
      }
      
      if (isVoiceInput) {
        speakText(data.text);
      }

      // Update the calendar display in case changes happened
      fetchTimeline();
    } catch (err) {
      console.error('Error sending chat message:', err);
      setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Ops, ocorreu um erro de conexão com o servidor. Verifique se o servidor backend está ativo.' }]);
    } finally {
      setIsSendingChat(false);
    }
  };

  // Delete Calendar Event
  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Tem certeza que deseja remover este compromisso?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/calendar/events/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro desconhecido no servidor.');
      }
      fetchTimeline();
      // Add feedback chat bubble
      setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Removi o compromisso solicitado da sua agenda.' }]);
    } catch (err) {
      console.error('Error deleting event:', err);
      alert(`Falha ao excluir compromisso: ${err.message}`);
    }
  };

  // Close custom alert Toast
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Setup WebSockets and Load Data
  useEffect(() => {
    const initData = async () => {
      const authStatus = await fetchStatus();
      await fetchTimeline();
      await fetchModelHealth();
      await fetchContacts();

      // Initialize chat greeting based on first access
      const isFirstAccess = localStorage.getItem('scheduleai_first_access') === null;
      if (isFirstAccess) {
        setChatHistory([
          {
            sender: 'assistant',
            text: 'Olá! Sou o **ScheduleAI**, seu assistente de agenda inteligente. Posso organizar seus compromissos e planejar seus alertas proativos de saída e preparação.\n\nExperimente me pedir: *"Marcar jantar hoje às 21h no Rubaiyat Faria Lima"*'
          }
        ]);
        localStorage.setItem('scheduleai_first_access', 'false');
      } else {
        setChatHistory([
          {
            sender: 'assistant',
            text: 'Olá de volta! Estou analisando seus hobbies e buscando as melhores sugestões locais e perguntas personalizadas para você...'
          }
        ]);
        
        try {
          const res = await fetch(`${BACKEND_URL}/api/assistant/proactive-greeting`);
          const data = await res.json();
          setChatHistory([
            {
              sender: 'assistant',
              text: data.text
            }
          ]);
        } catch (err) {
          console.error('Error fetching proactive greeting:', err);
          setChatHistory([
            {
              sender: 'assistant',
              text: 'Olá! Como está o seu dia? Quais são os seus hobbies preferidos ou o que gostaria de planejar hoje? Posso também te sugerir os eventos mais badalados na sua região!'
            }
          ]);
        }
      }

      if (authStatus && !authStatus.isConnected && authStatus.isConfigured) {
        console.log('[AUTO-CONNECT] User not connected. Automatically redirecting to Google Calendar connection...');
        connectGoogleRedirect();
      }

      // Helper to save coords
      const saveOrigin = async (coords) => {
        console.log('Saving origin coords:', coords);
        try {
          const res = await fetch(`${BACKEND_URL}/api/preferences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: coords })
          });
          const data = await res.json();
          setPreferences(data);
          fetchTimeline();
        } catch (err) {
          console.error('Error saving geolocation as origin:', err);
        }
      };

      // Fallback for when navigator.geolocation is not available (e.g. HTTP non-localhost) or permission denied
      const fallbackToIpLocation = async () => {
        console.log('Attempting IP-based geolocation fallback...');
        try {
          const res = await fetch('https://ipinfo.io/json');
          if (res.ok) {
            const data = await res.json();
            if (data.loc) {
              await saveOrigin(data.loc);
              return;
            }
          }
        } catch (err) {
          console.warn('IP-based geolocation via ipinfo failed:', err);
        }
        
        try {
          const res = await fetch('https://freeipapi.com/api/json');
          if (res.ok) {
            const data = await res.json();
            if (data.latitude && data.longitude) {
              await saveOrigin(`${data.latitude},${data.longitude}`);
              return;
            }
          }
        } catch (err) {
          console.error('Secondary IP geolocation fallback failed:', err);
        }
      };

      // Check geolocation and save it as origin
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const coords = `${position.coords.latitude},${position.coords.longitude}`;
            await saveOrigin(coords);
          },
          async (err) => {
            console.warn('Geolocation not allowed or failed:', err);
            await fallbackToIpLocation();
          }
        );
      } else {
        console.warn('Geolocation not supported by this browser or context (e.g. not HTTPS).');
        await fallbackToIpLocation();
      }
    };

    initData();

    // Listen to OS Notification permissions
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Connect socket client
    const socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
      console.log('Socket.io connected to server');
    });
    
    socket.on('auth_change', (data) => {
      console.log('Auth status changed:', data);
      setStatus(data.status);
      setPreferences(data.preferences);
      if (data.lastModelUsed) {
        setCurrentActiveModel(data.lastModelUsed);
      }
      fetchTimeline();
    });

    socket.on('notification', (notif) => {
      console.log('Proactive Alert Received:', notif);
      playChime();

      // Show HTML5 native notification if tab is blurred
      if (Notification.permission === 'granted') {
        new Notification(notif.title, {
          body: notif.message,
          icon: '/favicon.ico'
        });
      }

      // Add to toast UI
      setToasts(prev => [notif, ...prev]);

      // Automatically fetch updated calendar calculations
      fetchTimeline();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isSendingChat]);

  // Quick Prompt Click handler
  const handleQuickPrompt = (prompt) => {
    handleSendChat(prompt);
  };

  // Helper to format date nicely
  const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const renderSidebar = () => {
    return (
      <aside className="sidebar glass">
        {!isMobile && (
          <div className="brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="brand-icon">
                <Sparkles size={22} />
              </div>
              <span className="brand-title">ScheduleAI</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                type="button"
                onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                className="btn btn-secondary theme-toggle"
                style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              >
                {theme === 'dark' ? <Sun size={14} style={{ color: 'var(--text-primary)' }} /> : <Moon size={14} style={{ color: 'var(--text-primary)' }} />}
              </button>
            </div>
          </div>
        )}

        {/* Connection Status Card */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Conexão de Agenda</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="form-group" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Status:</span>
            {status.isConnected ? (
              <span className="status-badge connected">
                <Check size={14} /> Google Calendar
              </span>
            ) : (
              <span className="status-badge mock">
                <AlertTriangle size={14} /> Modo Simulado
              </span>
            )}
          </div>

          {status.isConnected ? (
            <button className="btn btn-danger" onClick={disconnectGoogle}>
              <LogOut size={16} /> Desconectar Google
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn btn-primary" onClick={connectGoogle} disabled={!status.isConfigured}>
                <Link2 size={16} /> Conectar Google Calendar
              </button>
              {!status.isConfigured && (
                <div style={{ display: 'flex', gap: '8px', padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>Credenciais Google não configuradas no .env. Executando em modo simulado completo.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Preferences Card */}
        <div className="card glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 className="section-title" style={{ margin: 0 }}>Preferências</h3>
            {!isEditingPrefs && (
              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setIsEditingPrefs(true)}>
                Editar
              </button>
            )}
          </div>

          {isEditingPrefs ? (
            <form onSubmit={handleSavePrefs} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label>URL do Servidor Backend</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="http://localhost:5000"
                    value={backendUrlInput} 
                    onChange={e => {
                      setBackendUrlInput(e.target.value);
                      setConnectionTestStatus('idle');
                    }}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => testConnection(backendUrlInput)}
                    disabled={connectionTestStatus === 'testing'}
                    style={{ padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                  >
                    {connectionTestStatus === 'testing' ? 'Testando...' : 'Testar'}
                  </button>
                </div>
                {connectionTestStatus === 'success' && (
                  <small style={{ color: '#4caf50', display: 'block', marginTop: '4px', fontWeight: '500' }}>
                    ✓ Conectado com sucesso!
                  </small>
                )}
                {connectionTestStatus === 'failed' && (
                  <small style={{ color: '#f44336', display: 'block', marginTop: '4px', fontWeight: '500' }}>
                    ✗ Falha na conexão com o servidor.
                  </small>
                )}
                <small style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Padrão: <code>http://localhost:5000</code>. Para HTTPS ou celular, informe a URL do túnel (ex: ngrok).
                </small>
              </div>

              <div className="form-group">
                <label>Transporte</label>
                <select 
                  className="form-input"
                  value={preferences.transportMode}
                  onChange={e => setPreferences({...preferences, transportMode: e.target.value})}
                >
                  <option value="driving">🚗 Carro (Dirigindo)</option>
                  <option value="transit">🚇 Transporte Público</option>
                  <option value="bicycling">🚲 Bicicleta</option>
                  <option value="walking">🚶 Caminhada</option>
                </select>
              </div>

              <div className="form-group">
                <label>Endereço de Casa</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Av. Paulista, 1000 - Bela Vista, São Paulo"
                  value={preferences.homeAddress || ''} 
                  onChange={e => setPreferences({...preferences, homeAddress: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Endereço de Trabalho</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Av. Brigadeiro Faria Lima, 3477 - Itaim Bibi, São Paulo"
                  value={preferences.workAddress || ''} 
                  onChange={e => setPreferences({...preferences, workAddress: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Modo de Voz (TTS)</label>
                <select 
                  className="form-input"
                  value={preferences.ttsMode || 'gemini'}
                  onChange={e => {
                    const mode = e.target.value;
                    const defaultVoice = mode === 'gemini' ? 'Puck' : (browserVoices[0]?.name || '');
                    setPreferences({...preferences, ttsMode: mode, ttsVoice: defaultVoice});
                  }}
                >
                  <option value="gemini">☁️ Gemini (Nuvem)</option>
                  <option value="browser">💻 Navegador (Local - 100% BR)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Voz do Assistente (TTS)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(!preferences.ttsMode || preferences.ttsMode === 'gemini') ? (
                    <select 
                      className="form-input"
                      value={preferences.ttsVoice || 'Puck'}
                      onChange={e => setPreferences({...preferences, ttsVoice: e.target.value})}
                      style={{ flex: 1 }}
                    >
                      <option value="Puck">👦 Puck (Masculino - Padrão)</option>
                      <option value="Charon">👨 Charon (Masculino Calmo)</option>
                      <option value="Kore">👩 Kore (Feminino Claro)</option>
                      <option value="Fenrir">🧔 Fenrir (Masculino Profundo)</option>
                      <option value="Aoede">👧 Aoede (Feminino Brilhante)</option>
                    </select>
                  ) : (
                    <select 
                      className="form-input"
                      value={preferences.ttsVoice || ''}
                      onChange={e => setPreferences({...preferences, ttsVoice: e.target.value})}
                      style={{ flex: 1 }}
                    >
                      {browserVoices.length === 0 ? (
                        <option value="">Nenhuma voz pt-BR encontrada no sistema</option>
                      ) : (
                        browserVoices.map(v => (
                          <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                        ))
                      )}
                    </select>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleTestVoice}
                    disabled={isTestingVoice}
                    style={{ padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {isTestingVoice ? 'Ouvindo...' : 'Testar'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Tema da Interface</label>
                <select 
                  className="form-input"
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
                >
                  <option value="dark">🌑 Escuro (Dark Mode)</option>
                  <option value="light">☀️ Claro (Light Mode)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Hobbies & Interesses (separados por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={preferences.hobbies || ''} 
                  onChange={e => setPreferences({...preferences, hobbies: e.target.value})}
                  placeholder="ex: jogos, shows, jazz, restaurantes, filmes"
                />
              </div>

              <div className="form-group">
                <label>Alertas de Aniversário (nomes separados por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={preferences.birthdayAlerts || ''} 
                  onChange={e => setPreferences({...preferences, birthdayAlerts: e.target.value})}
                  placeholder="ex: João Silva, Maria Santos"
                />
              </div>

              <div className="form-group">
                <label>Tempo de Preparação (minutos)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={preferences.prepTimeMinutes} 
                  onChange={e => setPreferences({...preferences, prepTimeMinutes: parseInt(e.target.value) || 0})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Aviso prévio para sair (minutos)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={preferences.leadTimeMinutes} 
                  onChange={e => setPreferences({...preferences, leadTimeMinutes: parseInt(e.target.value) || 0})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Antecedência de chegada (minutos)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={preferences.advanceArrivalMinutes} 
                  onChange={e => setPreferences({...preferences, advanceArrivalMinutes: parseInt(e.target.value) || 0})}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', margin: 0 }}>
                    <Sparkles size={14} style={{ color: 'var(--accent-color)' }} /> Prioridade de Modelos de IA
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '3px 6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={() => setShowCharacteristicsModal(true)}
                    >
                      <Info size={11} /> Specs
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={fetchModelHealth}
                      disabled={isCheckingHealth}
                    >
                      <RefreshCw size={11} className={isCheckingHealth ? 'spin-anim' : ''} />
                      {isCheckingHealth ? 'Testando...' : 'Testar Modelos'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(preferences.modelPriority || ['gemini-2.5-flash', 'gemini-2.0-flash']).map((model, idx) => {
                    const health = modelHealth[model] || {};
                    const dotColor = health.status === 'active' ? '#4caf50' : health.status === 'inactive' ? '#f44336' : '#ffeb3b';
                    return (
                      <div 
                        key={model} 
                        draggable={canDrag && !isMobile}
                        onDragStart={!isMobile ? (e) => handleDragStart(e, idx) : undefined}
                        onDragOver={!isMobile ? (e) => handleDragOver(e, idx) : undefined}
                        onDragEnd={!isMobile ? handleDragEnd : undefined}
                        onDrop={!isMobile ? (e) => handleDrop(e, idx) : undefined}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          padding: '6px 10px', 
                          background: draggedIndex === idx ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', 
                          border: dragOverIndex === idx && draggedIndex !== idx ? '1px dashed var(--accent-hover)' : '1px solid var(--border-color)', 
                          borderRadius: '8px', 
                          fontSize: '12px',
                          opacity: draggedIndex === idx ? 0.4 : 1,
                          cursor: 'default',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {!isMobile && (
                            <div
                              onMouseEnter={() => setCanDrag(true)}
                              onMouseLeave={() => setCanDrag(false)}
                              style={{ display: 'flex', alignItems: 'center', cursor: canDrag ? 'grabbing' : 'grab', padding: '2px 4px' }}
                            >
                              <GripVertical size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            </div>
                          )}
                          <span 
                            className={health.status === 'checking' ? 'pulse-anim' : ''}
                            style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              background: dotColor, 
                              display: 'inline-block',
                              boxShadow: health.status === 'checking' ? undefined : `0 0 6px ${dotColor}`
                            }}
                            title={health.message || 'Verificando status...'}
                          />
                          <span>{model}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 6px', fontSize: '10px' }} 
                            disabled={idx === 0}
                            onClick={() => moveModel(idx, -1)}
                          >
                            ▲
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 6px', fontSize: '10px' }} 
                            disabled={idx === (preferences.modelPriority?.length || 4) - 1}
                            onClick={() => moveModel(idx, 1)}
                          >
                            ▼
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 6px', fontSize: '10px', color: '#ff4d4d', border: '1px solid rgba(255, 77, 77, 0.2)', background: 'rgba(255, 77, 77, 0.05)', marginLeft: '4px' }} 
                            title="Remover modelo"
                            onClick={() => removeModel(idx)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '8px' }}>Salvar</button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '8px' }} onClick={() => setIsEditingPrefs(false)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Car size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Transporte: </span>
                  <strong>{preferences.transportMode === 'driving' ? 'Carro' : preferences.transportMode === 'transit' ? 'Trânsito Público' : preferences.transportMode === 'bicycling' ? 'Bicicleta' : 'A pé'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <MapPin size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Casa: </span>
                  <strong title={preferences.homeAddress}>{preferences.homeAddress ? (preferences.homeAddress.length > 25 ? preferences.homeAddress.substring(0, 25) + '...' : preferences.homeAddress) : 'Não configurado'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <MapPin size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Trabalho: </span>
                  <strong title={preferences.workAddress}>{preferences.workAddress ? (preferences.workAddress.length > 25 ? preferences.workAddress.substring(0, 25) + '...' : preferences.workAddress) : 'Não configurado'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Clock size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Se arrumar: </span>
                  <strong>{preferences.prepTimeMinutes} mins</strong> antes
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Bell size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Alerta de Saída: </span>
                  <strong>{preferences.leadTimeMinutes} mins</strong> antes
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Check size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Antecedência: </span>
                  <strong>{preferences.advanceArrivalMinutes || 15} mins</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Heart size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Hobbies: </span>
                  <strong>{preferences.hobbies || 'Nenhum'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Gift size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Aniversários: </span>
                  <strong>{preferences.birthdayAlerts || 'Nenhum'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Sparkles size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>IA Principal: </span>
                  <strong>{preferences.modelPriority?.[0] || 'gemini-2.5-flash'}</strong>
                  <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--text-secondary)' }}>
                    Modelo em uso: <strong style={{ color: 'var(--success)' }}>{currentActiveModel || preferences.modelPriority?.[0] || 'gemini-2.5-flash'}</strong>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-hover)', cursor: 'pointer', padding: '0', fontSize: '11px', textDecoration: 'underline', display: 'block', marginTop: '2px', textAlign: 'left' }}
                    onClick={() => setShowCharacteristicsModal(true)}
                  >
                    Ver características dos modelos
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions triggers */}
        <div className="card glass" style={{ marginTop: 'auto' }}>
          <h3 className="section-title">Sugestões Rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px', justifyContent: 'flex-start', padding: '8px 12px' }} onClick={() => { if (isMobile) setActiveTab('chat'); handleQuickPrompt('Jantar hoje às 21h no Rubaiyat Faria Lima'); }}>
              🍽️ Marcar Jantar às 21h
            </button>
            <button className="btn btn-secondary" style={{ fontSize: '12px', justifyContent: 'flex-start', padding: '8px 12px' }} onClick={() => { if (isMobile) setActiveTab('chat'); handleQuickPrompt('Listar meus compromissos de hoje'); }}>
              📅 Listar meus compromissos
            </button>
            <button className="btn btn-secondary" style={{ fontSize: '12px', justifyContent: 'flex-start', padding: '8px 12px' }} onClick={() => { if (isMobile) setActiveTab('chat'); handleQuickPrompt('Como está minha agenda para amanhã?'); }}>
              🔍 Consultar amanhã
            </button>
          </div>
        </div>
      </aside>
    );
  };

  const renderChat = () => {
    return (
      <section className={`chat-section ${isMobile ? 'mobile-tab-content' : ''}`}>
        {/* Messages list */}
        <div className="chat-messages">
          {chatHistory.map((msg, index) => (
            <div 
              key={index} 
              className={`message-bubble ${msg.sender}`}
            >
              {renderFormattedMessage(msg.text)}
              
              {msg.sender === 'assistant' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', gap: '8px' }}>
                  {isPlayingAudio && currentSpeakingText === msg.text ? (
                    <button
                      type="button"
                      className="chat-speaker-btn"
                      onClick={stopSpeaking}
                      title="Parar de ouvir"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        opacity: 0.8,
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        transition: 'opacity 0.2s'
                      }}
                    >
                      <VolumeX size={12} /> Parar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chat-speaker-btn"
                      onClick={() => speakText(msg.text)}
                      title="Ouvir resposta"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        opacity: 0.6,
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        transition: 'opacity 0.2s'
                      }}
                    >
                      <Volume2 size={12} /> Ouvir
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {isSendingChat && (
            <div className="message-bubble assistant" style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '12px 16px' }}>
              <span className="typing-dot" style={{ animationDelay: '0s' }}></span>
              <span className="typing-dot" style={{ animationDelay: '0.2s' }}></span>
              <span className="typing-dot" style={{ animationDelay: '0.4s' }}></span>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Message Input field */}
        <div className="chat-input-area" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          
          {/* Quick Voice Selector & Playback Control Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
              <Volume2 size={14} style={{ color: 'var(--accent-hover)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>Voz:</span>
              <select
                value={`${preferences.ttsMode || 'gemini'}:${preferences.ttsVoice || 'Puck'}`}
                onChange={async (e) => {
                  const [mode, voice] = e.target.value.split(':');
                  const updatedPrefs = { ...preferences, ttsMode: mode, ttsVoice: voice };
                  setPreferences(updatedPrefs);
                  
                  // Save automatically to backend
                  try {
                    await fetch(`${BACKEND_URL}/api/preferences`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(updatedPrefs)
                    });
                  } catch (err) {
                    console.error('Error saving voice preference:', err);
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: '500',
                  outline: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  width: '100%',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
              >
                <optgroup label="☁️ Gemini (Nuvem)">
                  <option value="gemini:Puck" style={{ background: '#18181b', color: 'white' }}>Puck (Masculino Padrão)</option>
                  <option value="gemini:Charon" style={{ background: '#18181b', color: 'white' }}>Charon (Masculino Calmo)</option>
                  <option value="gemini:Kore" style={{ background: '#18181b', color: 'white' }}>Kore (Feminino Claro)</option>
                  <option value="gemini:Fenrir" style={{ background: '#18181b', color: 'white' }}>Fenrir (Masculino Profundo)</option>
                  <option value="gemini:Aoede" style={{ background: '#18181b', color: 'white' }}>Aoede (Feminino Brilhante)</option>
                </optgroup>
                <optgroup label="💻 Navegador (Local - 100% BR)">
                  {browserVoices.length === 0 ? (
                    <option value="browser:" disabled style={{ background: '#18181b', color: 'var(--text-secondary)' }}>Nenhuma voz local encontrada</option>
                  ) : (
                    browserVoices.map(v => (
                      <option key={v.name} value={`browser:${v.name}`} style={{ background: '#18181b', color: 'white' }}>
                        {v.name.replace(/Microsoft|Google/gi, '').trim()} ({v.lang})
                      </option>
                    ))
                  )}
                </optgroup>
              </select>
            </div>
            
            {isPlayingAudio && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={stopSpeaking}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: 'var(--danger)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
              >
                <VolumeX size={12} /> Parar Fala
              </button>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              className={`btn-mic-outer ${isListening ? 'listening' : ''}`}
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              onPointerCancel={stopListening}
              title="Pressione e segure para falar"
              style={{
                width: '46px',
                height: '46px',
                minWidth: '46px',
                borderRadius: '50%',
                background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: isListening ? '1px solid #ef4444' : '1px solid var(--border-color)',
                color: isListening ? '#ef4444' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none',
                boxShadow: isListening ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none'
              }}
            >
              <Mic size={22} className={isListening ? 'pulse-mic' : ''} />
            </button>

            <div className="chat-input-wrapper" style={{ flex: 1 }}>
              <input 
                type="text" 
                className="chat-input"
                placeholder={isListening ? 'Ouvindo você... Fale agora' : "Envie uma mensagem (ex: 'Marcar jantar às 21h no Rubaiyat'...)"} 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                disabled={isSendingChat || isListening}
              />
              <button type="submit" className="btn btn-primary chat-send-btn" disabled={isSendingChat || isListening || !inputText.trim()}>
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  };

  const renderTimeline = () => {
    return (
      <section className={`timeline-section ${isMobile ? 'mobile-tab-content' : ''}`}>
        {/* Sub-Tabs Header */}
        <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
          <button 
            className={`btn-tab ${activeSecondTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveSecondTab('agenda')}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeSecondTab === 'agenda' ? 'var(--accent-hover)' : 'var(--text-secondary)',
              borderBottom: activeSecondTab === 'agenda' ? '2px solid var(--accent-hover)' : 'none',
              paddingBottom: '6px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Calendar size={18} />
            Agenda
          </button>
          <button 
            className={`btn-tab ${activeSecondTab === 'todo' ? 'active' : ''}`}
            onClick={() => setActiveSecondTab('todo')}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeSecondTab === 'todo' ? 'var(--accent-hover)' : 'var(--text-secondary)',
              borderBottom: activeSecondTab === 'todo' ? '2px solid var(--accent-hover)' : 'none',
              paddingBottom: '6px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckSquare size={18} />
            Tarefas
          </button>
          <button 
            className={`btn-tab ${activeSecondTab === 'contacts' ? 'active' : ''}`}
            onClick={() => { setActiveSecondTab('contacts'); fetchContacts(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeSecondTab === 'contacts' ? 'var(--accent-hover)' : 'var(--text-secondary)',
              borderBottom: activeSecondTab === 'contacts' ? '2px solid var(--accent-hover)' : 'none',
              paddingBottom: '6px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Users size={18} />
            Contatos
          </button>
        </div>

        {activeSecondTab === 'agenda' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={20} style={{ color: 'var(--accent-primary)' }} />
                <h2 style={isMobile ? { fontSize: '18px' } : undefined}>Cronograma da Agenda & Alertas de Trânsito</h2>
              </div>
              <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={fetchTimeline} disabled={isLoadingTimeline}>
                <RefreshCw size={16} className={isLoadingTimeline ? 'spin-anim' : ''} />
              </button>
            </div>

            <div className="timeline-grid">
              {calculations.length === 0 ? (
                <div className="card glass" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                  <Calendar size={36} />
                  <span>Nenhum compromisso agendado para as próximas 12 horas.</span>
                  <span style={{ fontSize: '12px' }}>Use {isMobile ? 'a aba Conversa' : 'o chat assistente ao lado'} para agendar novos eventos!</span>
                </div>
              ) : (
                calculations.map(calc => (
                  <div key={calc.eventId} className="card event-card has-triggers glass">
                    <div className="event-header">
                      <span className="event-time">
                        {formatDate(calc.eventStart)} - {formatTime(calc.eventStart)}
                      </span>
                      <button className="btn btn-secondary" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => handleDeleteEvent(calc.eventId)}>
                        <Trash2 size={15} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                    
                    <div className="event-title">{calc.summary}</div>
                    
                    {calc.location && (
                      <div className="event-location">
                        <MapPin size={14} style={{ color: 'var(--accent-hover)' }} />
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(calc.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-hover)', textDecoration: 'underline', fontWeight: '500', cursor: 'pointer' }}
                        >
                          {calc.location}
                        </a>
                      </div>
                    )}

                    {calc.location && calc.travelData && (
                      <div className="trigger-indicator">
                        <div className="trigger-step" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trânsito ({calc.travelData.distanceText}):</span>
                          <span className="time" style={{ color: 'var(--accent-hover)' }}>{calc.travelData.durationText}</span>
                        </div>
                        
                        <div className="trigger-step">
                          <span>👔 Se Arrume (1h antes):</span>
                          <span className="time">{formatTime(calc.getReadyTime)}</span>
                        </div>
                        
                        <div className="trigger-step">
                          <span>🔔 Aviso de Saída (15m antes):</span>
                          <span className="time">{formatTime(calc.warnLeaveTime)}</span>
                        </div>
                        
                        <div className="trigger-step" style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                          <span>🚗 Horário de Saída:</span>
                          <span className="time">{formatTime(calc.departureTime)}</span>
                        </div>
                      </div>
                    )}

                    {!calc.location && (
                      <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <Navigation size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>Sem local cadastrado. Alertas de partida proativos estão desativados para este evento.</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : activeSecondTab === 'todo' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckSquare size={20} style={{ color: 'var(--accent-primary)' }} />
                <h2 style={isMobile ? { fontSize: '18px' } : undefined}>Lista de Tarefas (To-Do List)</h2>
              </div>
              <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={fetchTasks}>
                <RefreshCw size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="card glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '14px', margin: 0, color: 'var(--text-primary)' }}>Nova Tarefa</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ flex: 1, minWidth: '150px' }}
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Título da tarefa..."
                  required
                />
                <input 
                  type="date" 
                  className="form-input" 
                  value={newTaskDeadline}
                  onChange={e => setNewTaskDeadline(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select className="form-input" style={{ flex: 1 }} value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)}>
                  <option value="low">Prioridade: Baixa</option>
                  <option value="medium">Prioridade: Média</option>
                  <option value="high">Prioridade: Alta</option>
                </select>
                <select className="form-input" style={{ flex: 1 }} value={newTaskEnergy} onChange={e => setNewTaskEnergy(e.target.value)}>
                  <option value="low">Energia: Baixa</option>
                  <option value="medium">Energia: Média</option>
                  <option value="high">Energia: Alta</option>
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>
                  Adicionar
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tasks.length === 0 ? (
                <div className="card glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                  <CheckSquare size={36} />
                  <span>Nenhuma tarefa cadastrada. Crie uma acima ou peça para a IA cadastrar!</span>
                </div>
              ) : (
                tasks.map(task => (
                  <div key={task.id} className="card glass hover-lift" style={{ padding: '16px', borderLeft: `4px solid ${task.priority === 'high' ? 'var(--danger)' : task.priority === 'medium' ? 'var(--warning)' : 'var(--success)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <input 
                          type="checkbox" 
                          checked={task.state === 'completed'} 
                          onChange={() => handleToggleTaskState(task.id, task.state)}
                          style={{ marginTop: '4px', transform: 'scale(1.2)', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: '600', textDecoration: task.state === 'completed' ? 'line-through' : 'none', color: 'var(--text-primary)' }}>
                            {task.summary}
                          </div>
                          {task.description && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {task.description}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '10px' }}>
                              {task.priority === 'high' ? '🔴 Alta' : task.priority === 'medium' ? '🟡 Média' : '🟢 Baixa'}
                            </span>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '10px' }}>
                              ⚡ {task.requiredEnergy === 'high' ? 'Alta' : task.requiredEnergy === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                            {task.deadline && (
                              <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '10px', color: 'var(--accent-hover)' }}>
                                📅 Prazo: {task.deadline.split('T')[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => handleDeleteTask(task.id)}>
                        <Trash2 size={15} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={20} style={{ color: 'var(--accent-primary)' }} />
                <h2 style={isMobile ? { fontSize: '18px' } : undefined}>Meus Contatos</h2>
              </div>
              <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={fetchContacts} disabled={isLoadingContacts}>
                <RefreshCw size={16} className={isLoadingContacts ? 'spin-anim' : ''} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Buscar contato por nome, e-mail ou telefone..." 
                value={contactSearchQuery}
                onChange={e => setContactSearchQuery(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isLoadingContacts && contacts.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-hover)' }} />
                </div>
              ) : (() => {
                const filtered = contacts.filter(contact => {
                  const q = contactSearchQuery.toLowerCase();
                  return (
                    contact.name.toLowerCase().includes(q) ||
                    (contact.email && contact.email.toLowerCase().includes(q)) ||
                    (contact.phone && contact.phone.includes(q))
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="card glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                      <Users size={36} />
                      <span>{contacts.length === 0 ? 'Nenhum contato encontrado na agenda.' : 'Nenhum contato coincide com a busca.'}</span>
                    </div>
                  );
                }

                const currentAlerts = preferences.birthdayAlerts || '';
                const monitoredNames = currentAlerts.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);

                return filtered.map(contact => {
                  const isMonitored = monitoredNames.includes(contact.name.toLowerCase());
                  
                  let mapsLink = '';
                  if (contact.address) {
                    mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address.trim())}`;
                  }

                  return (
                    <div key={contact.resourceName} className="card glass hover-lift" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            background: 'rgba(255,255,255,0.05)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            color: 'var(--accent-hover)',
                            border: '1px solid var(--border-color)',
                            flexShrink: 0
                          }}>
                            {contact.name ? contact.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '15px' }}>
                              {contact.name}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {contact.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Mail size={12} style={{ color: 'var(--accent-hover)' }} />
                                  <span>{contact.email}</span>
                                </div>
                              )}
                              {contact.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Phone size={12} style={{ color: 'var(--accent-hover)' }} />
                                  <span>{contact.phone}</span>
                                </div>
                              )}
                              {contact.address && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <MapPin size={12} style={{ color: 'var(--accent-hover)', flexShrink: 0 }} />
                                  <a 
                                    href={mapsLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    style={{ color: 'var(--accent-hover)', textDecoration: 'underline' }}
                                    title="Ver no Google Maps"
                                  >
                                    {contact.address}
                                  </a>
                                </div>
                              )}
                              {contact.birthday && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Cake size={12} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                  <span>Aniversário: {contact.birthday.split('-').reverse().join('/')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button 
                            className={`btn ${isMonitored ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => handleToggleBirthdayAlert(contact)}
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '12px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px',
                              borderRadius: '20px',
                              background: isMonitored ? 'rgba(235, 94, 85, 0.2)' : 'rgba(255,255,255,0.03)',
                              color: isMonitored ? '#eb5e55' : 'var(--text-secondary)',
                              border: isMonitored ? '1px solid #eb5e55' : '1px solid var(--border-color)',
                            }}
                            title={isMonitored ? 'Alerta de Aniversário Ativo' : 'Ativar Alerta de Aniversário'}
                          >
                            <Cake size={13} style={{ color: isMonitored ? '#eb5e55' : 'var(--text-secondary)' }} />
                            <span>{isMonitored ? 'Alerta Ativo' : 'Lembrar Aniversário'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <div className={`app-container ${isMobile ? 'mobile-mode' : 'desktop-mode'}`}>
      
      {/* Toast Notification Containers */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type} glass`}>
            <div className="toast-icon">
              <Bell size={18} />
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
          </div>
        ))}
      </div>

      {isMobile ? (
        <>
          {/* MOBILE HEADER */}
          <header className="mobile-header glass">
            <div className="mobile-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="brand-icon" style={{ padding: '6px', borderRadius: '8px' }}>
                <Sparkles size={14} />
              </div>
              <span className="brand-title" style={{ fontSize: '18px' }}>ScheduleAI</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span 
                className="status-dot" 
                style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: status.isConnected ? 'var(--success)' : 'var(--warning)',
                  boxShadow: status.isConnected ? '0 0 6px var(--success)' : '0 0 6px var(--warning)',
                  display: 'inline-block'
                }}
                title={status.isConnected ? 'Google Calendar Conectado' : 'Modo Simulado'}
              />
              
              <button 
                type="button"
                onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                className="btn btn-secondary theme-toggle"
                style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              >
                {theme === 'dark' ? <Sun size={14} style={{ color: 'var(--text-primary)' }} /> : <Moon size={14} style={{ color: 'var(--text-primary)' }} />}
              </button>
            </div>
          </header>

          {/* MOBILE BODY CONTENT */}
          <div className="mobile-body-content">
            {activeTab === 'chat' && renderChat()}
            {activeTab === 'agenda' && renderTimeline()}
            {activeTab === 'ajustes' && renderSidebar()}
          </div>

          {/* MOBILE TAB NAV BAR */}
          <nav className="mobile-tab-bar glass">
            <button 
              className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={18} />
              <span>Conversa</span>
            </button>
            <button 
              className={`tab-item ${activeTab === 'agenda' ? 'active' : ''}`}
              onClick={() => setActiveTab('agenda')}
            >
              <Calendar size={18} />
              <span>Agenda</span>
            </button>
            <button 
              className={`tab-item ${activeTab === 'ajustes' ? 'active' : ''}`}
              onClick={() => setActiveTab('ajustes')}
            >
              <Settings size={18} />
              <span>Ajustes</span>
            </button>
          </nav>
        </>
      ) : (
        /* Desktop Layout (Original) */
        <>
          {renderSidebar()}
          <main className="main-content">
            {renderChat()}
            {renderTimeline()}
          </main>
        </>
      )}

      {showCharacteristicsModal && (
        <div className="modal-overlay" onClick={() => setShowCharacteristicsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Especialidades e Características dos Modelos</h3>
              <button className="modal-close" onClick={() => setShowCharacteristicsModal(false)}>✕</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="modal-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Tipo</th>
                    <th>Especialidades / Tags</th>
                    <th>Ideal Para</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>gemini-2.5-flash</strong></td>
                    <td><span className="badge badge-cloud">Nuvem (Google)</span></td>
                    <td>
                      <span className="badge badge-search">Busca Web</span>
                      <span className="badge badge-fast">Baixa Latência</span>
                    </td>
                    <td>Perguntas dinâmicas (clima, notícias), agendamentos rápidos e interações gerais com trânsito e mapas.</td>
                  </tr>
                  <tr>
                    <td><strong>gemini-2.0-flash</strong></td>
                    <td><span className="badge badge-cloud">Nuvem (Google)</span></td>
                    <td>
                      <span className="badge badge-fast">Rápido</span>
                      <span className="badge badge-logic">Geral</span>
                    </td>
                    <td>Comandos e interações gerais do dia a dia com excelente custo-benefício e velocidade.</td>
                  </tr>
                  <tr>
                    <td><strong>1-UNC-Qwen3.5-9B-Q4-LOGICA</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-logic">Lógica</span>
                      <span className="badge badge-logic">Raciocínio</span>
                    </td>
                    <td>Cálculo de viabilidade de agenda diária, análise de conflitos complexos de horário e planejamento semanal.</td>
                  </tr>
                  <tr>
                    <td><strong>4-Qwen2.5-coder:7b-PROGRAMACAO</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-code">Programação</span>
                      <span className="badge badge-code">Código</span>
                    </td>
                    <td>Simulações avançadas no sandbox de regras do ScheduleAI, automações e análise técnica de regras.</td>
                  </tr>
                  <tr>
                    <td><strong>5-UNC-Dolphin-Llama3-CRIATIVO</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-creative">Criativo</span>
                      <span className="badge badge-creative">Escrita</span>
                    </td>
                    <td>Rascunho de e-mails, redação de justificativas de atraso e elaboração de mensagens de acompanhamento.</td>
                  </tr>
                  <tr>
                    <td><strong>3-Llama3.2:3b-RAPIDO</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-fast">Rápido</span>
                      <span className="badge badge-fast">Ações Rápidas</span>
                    </td>
                    <td>Execução de rotinas básicas locais, listagem e criação de tarefas pontuais com baixa latência.</td>
                  </tr>
                  <tr>
                    <td><strong>6-Qwen2.5:1.5b-MUITORAPIDO</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-fast">Ultra Rápido</span>
                      <span className="badge badge-fast">Simples</span>
                    </td>
                    <td>Respostas ultrarápidas a comandos muito diretos e verificação de integridade local.</td>
                  </tr>
                  <tr>
                    <td><strong>2-Gemma3:4b-GERAL</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-local">Geral</span>
                    </td>
                    <td>Fallback local alternativo para interações de caráter genérico.</td>
                  </tr>
                  <tr>
                    <td><strong>huihui_ai/granite4.1-abliterated:3b</strong></td>
                    <td><span className="badge badge-local">Local (Ollama)</span></td>
                    <td>
                      <span className="badge badge-local">Geral</span>
                    </td>
                    <td>Fallback local geral e operações gerais locais.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              💡 <em>O ScheduleAI escolhes e ordena os modelos dinamicamente com base nas palavras-chave do seu pedido.</em>
            </p>
          </div>
        </div>
      )}

      {/* Embedded CSS animations not fully covered in index.css */}
      <style>{`
        .spin-anim {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .typing-dot {
          width: 8px;
          height: 8px;
          background: var(--text-secondary);
          border-radius: 50%;
          animation: pulse 1.2s infinite ease-in-out;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(0.6); opacity: 0.4; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>

    </div>
  );
}

export default App;
