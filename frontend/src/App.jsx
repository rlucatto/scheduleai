import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Calendar, 
  MapPin, 
  Car, 
  Clock, 
  Send, 
  User, 
  Plus,
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
  Cake,
  Tag,
  Star,
  Edit2,
  Download
} from 'lucide-react';

const parseBold = (text) => {
  return text.split('**').map((chunk, cIdx) => {
    return cIdx % 2 === 1 ? <strong key={`bold-${cIdx}`}>{chunk}</strong> : chunk;
  });
};

const parseDateSafe = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
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

let googleMapsLoadingPromise = null;

const loadGoogleMapsScript = (apiKey) => {
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoadingPromise) {
    return googleMapsLoadingPromise;
  }

  googleMapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = (err) => {
      googleMapsLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
};

const getBackendUrl = () => {
  const saved = localStorage.getItem('backend_url');
  if (saved) return saved;
  
  if (window.Capacitor) {
    return 'https://scheduleai-hz68.onrender.com';
  }
  
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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const registerPush = async (backendUrl) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push messaging is not supported in this browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      const res = await fetch(`${backendUrl}/api/push/public-key`);
      const { publicKey } = await res.json();
      if (!publicKey) {
        console.warn('VAPID public key not found on server.');
        return;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    await fetch(`${backendUrl}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription })
    });
    console.log('Web Push subscription registered on backend successfully.');
  } catch (err) {
    console.error('Error during push registration:', err);
  }
};

const getEventColor = (eventId, index) => {
  const colors = [
    'hsl(142, 60%, 45%)',  // Emerald Green
    'hsl(190, 75%, 45%)',  // Teal/Cyan
    'hsl(325, 70%, 55%)',  // Pink/Rose
    'hsl(215, 80%, 50%)',  // Royal Blue
    'hsl(85, 65%, 45%)',   // Lime Green
    'hsl(350, 70%, 50%)'   // Crimson Red
  ];
  return colors[index % colors.length];
};

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
  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [preferences, setPreferences] = useState({
    origin: '',
    homeAddress: '',
    workAddress: '',
    transportMode: 'driving',
    prepTimeMinutes: 60,
    leadTimeMinutes: 15,
    advanceArrivalMinutes: 15,
    ttsMode: 'gemini',
    ttsVoice: 'pt-BR-FranciscaNeural',
    ttsSpeed: 1.0,
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
  const [currentActiveKey, setCurrentActiveKey] = useState('');
  const [currentActiveKeyString, setCurrentActiveKeyString] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [canDrag, setCanDrag] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeSecondTab, setActiveSecondTab] = useState('agenda');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const [selectedLocationDate, setSelectedLocationDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [locationHistory, setLocationHistory] = useState([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showGPSHelpModal, setShowGPSHelpModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const fetchLocationHistory = async (dateStr) => {
    setIsLoadingLocations(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/location/history?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setLocationHistory(data);
      } else {
        console.error('Failed to fetch location history');
      }
    } catch (err) {
      console.error('Error fetching location history:', err);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const navigateDay = (amount) => {
    const current = new Date(selectedLocationDate + 'T12:00:00');
    current.setDate(current.getDate() + amount);
    const nextDateStr = current.toISOString().split('T')[0];
    setSelectedLocationDate(nextDateStr);
    fetchLocationHistory(nextDateStr);
  };

  const mapInstanceRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);
  const appointmentsContainerRef = useRef(null);
  const scrolledOnceRef = useRef(false);

  useEffect(() => {
    if (activeSecondTab !== 'location' || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!googleMapsKey) {
      console.warn('Google Maps API Key not available.');
      return;
    }

    loadGoogleMapsScript(googleMapsKey).then((googleMaps) => {
      if (!mapContainerRef.current) return;

      let center = { lat: -23.561, lng: -46.655 }; // default SP
      if (locationHistory.length > 0) {
        const lastRec = locationHistory[locationHistory.length - 1];
        center = { lat: lastRec.latitude, lng: lastRec.longitude };
      }

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new googleMaps.Map(mapContainerRef.current, {
          center: center,
          zoom: 13,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1e1e1e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1e1e1e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#aaaaaa" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
            { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1e293b" }] }
          ],
          disableDefaultUI: false,
        });
      } else {
        mapInstanceRef.current.setCenter(center);
      }

      const map = mapInstanceRef.current;

      // Clear old markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const bounds = new googleMaps.LatLngBounds();

      locationHistory.forEach((loc, index) => {
        const isLatest = index === locationHistory.length - 1;
        const color = isLatest ? '#4f46e5' : '#22c55e'; // Indigo or Green

        const position = { lat: loc.latitude, lng: loc.longitude };
        bounds.extend(position);

        const marker = new googleMaps.Marker({
          position: position,
          map: map,
          title: `Ponto #${index + 1} - ${loc.time}`,
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: isLatest ? 8 : 6,
          }
        });

        const popupContent = `
          <div style="font-family: sans-serif; color: #1e293b; padding: 4px; min-width: 150px; line-height: 1.4;">
            <strong style="display:block; margin-bottom: 2px; color: #1e293b;">Ponto #${index + 1} - ${loc.time}</strong>
            <span style="font-size: 11px; display:block; color: #64748b; margin-bottom: 4px;">${loc.address}</span>
            ${loc.observations ? `<span style="font-size: 11px; padding: 2px 6px; background-color: #e2e8f0; border-radius: 4px; color: #334155; display: inline-block; font-weight: 500;">${loc.observations}</span>` : ''}
          </div>
        `;

        const infowindow = new googleMaps.InfoWindow({
          content: popupContent,
        });

        marker.addListener('click', () => {
          infowindow.open({
            anchor: marker,
            map,
            shouldFocus: false,
          });
        });

        markersRef.current.push(marker);

        if (isLatest) {
          infowindow.open({
            anchor: marker,
            map,
            shouldFocus: false,
          });
        }
      });

      if (locationHistory.length > 0) {
        if (locationHistory.length === 1) {
          map.setCenter({ lat: locationHistory[0].latitude, lng: locationHistory[0].longitude });
          map.setZoom(14);
        } else {
          map.fitBounds(bounds);
        }
      }
    }).catch(err => {
      console.error('Error loading Google Maps:', err);
    });
  }, [activeSecondTab, locationHistory, googleMapsKey]);

  useEffect(() => {
    console.log('[SCROLL] useEffect triggered:', {
      activeTab,
      activeSecondTab,
      scrolledOnce: scrolledOnceRef.current,
      calcLength: calculations.length
    });
    if (activeTab === 'agenda' && activeSecondTab === 'agenda') {
      if (!scrolledOnceRef.current && calculations.length > 0) {
        const now = currentTime.getTime();
        
        // 1. Try to find an event currently in progress
        let targetEvent = calculations.find(calc => {
          const evStart = parseDateSafe(calc.eventStart)?.getTime() || 0;
          const evEnd = (parseDateSafe(calc.eventEnd) || new Date(evStart + 60 * 60 * 1000)).getTime();
          return now >= evStart && now <= evEnd;
        });

        // 2. If no event is in progress, find the next upcoming event
        if (!targetEvent) {
          const futureEvents = calculations
            .filter(calc => {
              const evStart = parseDateSafe(calc.eventStart)?.getTime() || 0;
              return evStart > now;
            })
            .sort((a, b) => {
              const aStart = parseDateSafe(a.eventStart)?.getTime() || 0;
              const bStart = parseDateSafe(b.eventStart)?.getTime() || 0;
              return aStart - bStart;
            });
          if (futureEvents.length > 0) {
            targetEvent = futureEvents[0];
          }
        }

        const targetEventId = targetEvent?.eventId;
        console.log('[SCROLL] Target event found:', targetEvent?.summary, 'ID:', targetEventId);

        if (targetEventId) {
          setTimeout(() => {
            const container = appointmentsContainerRef.current;
            console.log('[SCROLL] Running scroll timeout:', {
              containerExists: !!container
            });
            if (container) {
              const card = container.querySelector(`.event-card[data-event-id="${targetEventId}"]`);
              console.log('[SCROLL] Card found:', !!card);
              if (card) {
                const containerTop = container.getBoundingClientRect().top;
                const cardTop = card.getBoundingClientRect().top;
                const relativeTop = cardTop - containerTop + container.scrollTop;
                console.log('[SCROLL] Scrolling to:', relativeTop);
                container.scrollTo({ top: relativeTop, behavior: 'smooth' });
                scrolledOnceRef.current = true;
              }
            }
          }, 250);
        } else {
          scrolledOnceRef.current = true;
        }
      }
    } else {
      scrolledOnceRef.current = false;
    }
  }, [activeTab, activeSecondTab, calculations]);

  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [editingContactResourceName, setEditingContactResourceName] = useState(null);
  const [newTagNameInput, setNewTagNameInput] = useState('');
  const [newTagTypeInput, setNewTagTypeInput] = useState('private');
  const [selectedFilterTag, setSelectedFilterTag] = useState('Todos');
  const [showTagSettingsModal, setShowTagSettingsModal] = useState(false);
  const [birthdayModalOpen, setBirthdayModalOpen] = useState(false);
  const [birthdayContact, setBirthdayContact] = useState(null);
  const [birthdayInputValue, setBirthdayInputValue] = useState('');
  const [editContactModalOpen, setEditContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editFormName, setEditFormName] = useState('');
  const [editFormPhone, setEditFormPhone] = useState('');
  const [editFormEmail, setEditFormEmail] = useState('');
  const [editFormAddress, setEditFormAddress] = useState('');
  const [editFormBirthday, setEditFormBirthday] = useState('');
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

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    return localStorage.getItem('voice_enabled') === 'true';
  });
  const [isListening, setIsListening] = useState(false);
  const [audioElement, setAudioElement] = useState(null);
  const recognitionRef = useRef(null);
  const handleSendChatRef = useRef(null);
  const ttsTimerIntervalRef = useRef(null);
  const [ttsLoadingText, setTtsLoadingText] = useState('');
  const [ttsElapsedTime, setTtsElapsedTime] = useState(0);

  const startTtsTimer = (text) => {
    if (ttsTimerIntervalRef.current) {
      clearInterval(ttsTimerIntervalRef.current);
    }
    setTtsLoadingText(text);
    setTtsElapsedTime(0);
    const startTime = Date.now();
    ttsTimerIntervalRef.current = setInterval(() => {
      setTtsElapsedTime(Date.now() - startTime);
    }, 100);
  };

  const freezeTtsTimer = () => {
    if (ttsTimerIntervalRef.current) {
      clearInterval(ttsTimerIntervalRef.current);
      ttsTimerIntervalRef.current = null;
    }
  };

  const resetTtsTimer = () => {
    if (ttsTimerIntervalRef.current) {
      clearInterval(ttsTimerIntervalRef.current);
      ttsTimerIntervalRef.current = null;
    }
    setTtsLoadingText('');
    setTtsElapsedTime(0);
  };

  useEffect(() => {
    localStorage.setItem('voice_enabled', isVoiceEnabled);
  }, [isVoiceEnabled]);

  // Keep ref up to date to prevent stale closures in recognition event handlers
  useEffect(() => {
    handleSendChatRef.current = handleSendChat;
  });



  const speakText = async (text) => {
    if (!text) return;
    
    resetTtsTimer();
    startTtsTimer(text);

    // Stop currently playing audio if any
    if (audioElement) {
      try {
        audioElement.pause();
      } catch (e) {}
    }
    
    setIsPlayingAudio(false);
    setCurrentSpeakingText('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: preferences.ttsVoice || 'Faber' })
      });

      if (!res.ok) {
        throw new Error('TTS Endpoint responded with error');
      }

      const data = await res.json();
      if (data.audio) {
        const audioUrl = `data:audio/wav;base64,${data.audio}`;
        const newAudio = new Audio(audioUrl);
        newAudio.onplay = () => {
          freezeTtsTimer();
          setIsPlayingAudio(true);
          setCurrentSpeakingText(text);
        };
        newAudio.onended = () => {
          resetTtsTimer();
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        newAudio.onpause = () => {
          resetTtsTimer();
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        newAudio.onerror = () => {
          resetTtsTimer();
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        setAudioElement(newAudio);
        newAudio.defaultPlaybackRate = preferences.ttsSpeed || 1.0;
        newAudio.playbackRate = preferences.ttsSpeed || 1.0;
        newAudio.play().catch(e => {
          console.warn('[TTS] Autoplay blocked:', e);
          resetTtsTimer();
        });
      } else {
        throw new Error('No audio in response');
      }
    } catch (err) {
      console.warn('[TTS] Gemini TTS failed:', err.message);
      resetTtsTimer();
    }
  };

  const stopSpeaking = () => {
    resetTtsTimer();
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

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice: preferences.ttsVoice || 'Faber' })
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
        newAudio.onerror = () => {
          setIsPlayingAudio(false);
          setCurrentSpeakingText('');
        };
        setAudioElement(newAudio);
        newAudio.defaultPlaybackRate = preferences.ttsSpeed || 1.0;
        newAudio.playbackRate = preferences.ttsSpeed || 1.0;
        newAudio.play().catch(e => {
          console.warn('[TTS Test] Autoplay blocked:', e);
        });
      } else {
        throw new Error('No audio returned');
      }
    } catch (err) {
      console.warn('[TTS Test] Gemini test failed:', err.message);
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
    const currentModels = preferences.modelPriority || ['gemini-2.5-flash'];
    
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
      if (data.googleMapsApiKey) {
        setGoogleMapsKey(data.googleMapsApiKey);
      }
      
      let finalPrefs = data.preferences;
      
      // Smart Restore from localStorage backup if backend returned default/empty but we have a backup
      const savedPrefs = localStorage.getItem('scheduleai_preferences');
      if (savedPrefs) {
        try {
          const parsed = JSON.parse(savedPrefs);
          // Sanitize old defaults to prevent restoring them
          if (parsed.homeAddress === 'Avenida Paulista, 1000, São Paulo, SP') parsed.homeAddress = '';
          if (parsed.userName === 'Rafael') parsed.userName = '';
          if (parsed.agentName === 'ScheduleAI') parsed.agentName = '';
          if (parsed.origin === 'São Paulo, SP' || parsed.origin === '42.041061,-87.70192000000002') parsed.origin = '';
          if (parsed.onboardingStep === 'completed' && (!parsed.userName || !parsed.agentName)) {
            parsed.onboardingStep = 'welcome';
          }
          if (parsed.modelPriority) {
            parsed.modelPriority = parsed.modelPriority.filter(m => m !== 'gemini-2.0-flash' && m !== 'gemini-1.5-flash');
            if (parsed.modelPriority.length === 0) parsed.modelPriority = ['gemini-2.5-flash'];
          }

          if ((!data.preferences.homeAddress && parsed.homeAddress) || 
              (!data.preferences.userName && parsed.userName) ||
              (data.preferences.onboardingStep === 'welcome' && parsed.onboardingStep === 'completed')) {
            console.log('[PREFS] Restoring preferences backup from localStorage...');
            const restoreRes = await fetch(`${BACKEND_URL}/api/preferences`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed)
            });
            if (restoreRes.ok) {
              finalPrefs = await restoreRes.json();
            }
          }
        } catch (e) {
          console.error('Failed to restore preferences backup:', e);
        }
      }
      
      if (finalPrefs.modelPriority) {
        finalPrefs.modelPriority = finalPrefs.modelPriority.filter(m => m !== 'gemini-2.0-flash' && m !== 'gemini-1.5-flash');
        if (finalPrefs.modelPriority.length === 0) finalPrefs.modelPriority = ['gemini-2.5-flash'];
      }

      setPreferences(finalPrefs);
      localStorage.setItem('scheduleai_preferences', JSON.stringify(finalPrefs));

      if (data.lastModelUsed) {
        setCurrentActiveModel(data.lastModelUsed);
      }
      if (data.lastKeyUsed) {
        setCurrentActiveKey(data.lastKeyUsed);
      }
      if (data.lastKeyStringUsed !== undefined) {
        setCurrentActiveKeyString(data.lastKeyStringUsed);
      }

      // Fetch local Ollama models list asynchronously in the background
      fetch(`${BACKEND_URL}/api/models/local`)
        .then(res => res.json())
        .then(localModelsData => {
          setLocalModels(localModelsData);
          const existingPriority = finalPrefs.modelPriority || ['gemini-2.5-flash'];
          const mergedPriority = [...existingPriority];
          localModelsData.forEach(model => {
            if (!mergedPriority.includes(model)) {
              mergedPriority.push(model);
            }
          });
          const fullyMergedPrefs = {
            ...finalPrefs,
            modelPriority: mergedPriority
          };
          setPreferences(fullyMergedPrefs);
          localStorage.setItem('scheduleai_preferences', JSON.stringify(fullyMergedPrefs));
        })
        .catch(localErr => {
          console.log('Error fetching local models:', localErr);
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
  const fetchContacts = async (emailParam) => {
    setIsLoadingContacts(true);
    try {
      const email = emailParam !== undefined ? emailParam : (status.userEmail || '');
      const res = await fetch(`${BACKEND_URL}/api/contacts?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
      await fetchTags(email);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Fetch tags
  const fetchTags = async (emailParam) => {
    try {
      const email = emailParam !== undefined ? emailParam : (status.userEmail || '');
      const res = await fetch(`${BACKEND_URL}/api/tags?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setAllTags(data);
      }
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  };

  // Create new tag
  const handleCreateTag = async (tagName, tagType) => {
    if (!tagName.trim()) return null;
    try {
      const email = status.userEmail || '';
      const res = await fetch(`${BACKEND_URL}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tagName.trim(), type: tagType, email })
      });
      if (res.ok) {
        const data = await res.json();
        setAllTags(data);
        setNewTagNameInput('');
        addCustomToast('Sucesso', `Tag "${tagName}" criada com sucesso!`, 'success');
        return tagName.trim();
      } else {
        const errData = await res.json();
        addCustomToast('Erro', errData.error || 'Não foi possível criar a tag.', 'error');
      }
    } catch (err) {
      console.error('Error creating tag:', err);
      addCustomToast('Erro', 'Erro ao criar a tag.', 'error');
    }
    return null;
  };

  // Delete a tag
  const handleDeleteTag = async (tagName) => {
    if (!window.confirm(`Tem certeza de que deseja excluir a tag "${tagName}"?`)) {
      return;
    }
    try {
      const email = status.userEmail || '';
      const res = await fetch(`${BACKEND_URL}/api/tags?name=${encodeURIComponent(tagName)}&email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        setAllTags(data);
        addCustomToast('Sucesso', `Tag "${tagName}" excluída com sucesso!`, 'success');
        fetchContacts();
      } else {
        const errData = await res.json();
        addCustomToast('Erro', errData.error || 'Não foi possível excluir a tag.', 'error');
      }
    } catch (err) {
      console.error('Error deleting tag:', err);
      addCustomToast('Erro', 'Erro ao excluir a tag.', 'error');
    }
  };

  // Toggle a tag association for a contact
  const handleToggleContactTag = async (contact, tagName) => {
    const email = status.userEmail || '';
    const currentTags = contact.tags || [];
    let updatedTags;
    if (currentTags.includes(tagName)) {
      updatedTags = currentTags.filter(t => t !== tagName);
    } else {
      updatedTags = [...currentTags, tagName];
    }

    // Optimistically update frontend state
    setContacts(prev => prev.map(c => {
      if (c.resourceName === contact.resourceName) {
        return { ...c, tags: updatedTags };
      }
      return c;
    }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/contacts/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceName: contact.resourceName, tags: updatedTags, email })
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(prev => prev.map(c => {
          if (c.resourceName === contact.resourceName) {
            return { ...c, tags: data.tags };
          }
          return c;
        }));
      }
    } catch (err) {
      console.error('Error toggling contact tag:', err);
      addCustomToast('Erro', 'Não foi possível atualizar as tags do contato.', 'error');
      // Revert optimistic update
      setContacts(prev => prev.map(c => {
        if (c.resourceName === contact.resourceName) {
          return { ...c, tags: currentTags };
        }
        return c;
      }));
    }
  };

  // Handle birthday input change with automatic date mask (DD/MM/YYYY or DD/MM)
  const handleBirthdayInputChange = (e) => {
    let value = e.target.value.replace(/\D/g, ''); // only digits
    if (value.length > 8) value = value.slice(0, 8);
    
    let formatted = '';
    if (value.length > 0) {
      formatted += value.slice(0, 2);
    }
    if (value.length > 2) {
      formatted += '/' + value.slice(2, 4);
    }
    if (value.length > 4) {
      formatted += '/' + value.slice(4, 8);
    }
    setBirthdayInputValue(formatted);
  };

  // Helper to complete the birthday alert toggle
  const proceedWithToggleBirthdayAlert = async (contact) => {
    const name = contact.name;
    let monitoredNames = [];
    let wasArray = Array.isArray(preferences.birthdayAlerts);
    if (preferences.birthdayAlerts) {
      if (wasArray) {
        monitoredNames = preferences.birthdayAlerts.map(n => n.trim()).filter(Boolean);
      } else if (typeof preferences.birthdayAlerts === 'string') {
        monitoredNames = preferences.birthdayAlerts.split(',').map(n => n.trim()).filter(Boolean);
      }
    }
    const isAlreadyMonitored = monitoredNames.some(n => n.toLowerCase() === name.toLowerCase());
    
    let updatedAlertsList;
    if (isAlreadyMonitored) {
      updatedAlertsList = monitoredNames.filter(n => n.toLowerCase() !== name.toLowerCase());
    } else {
      updatedAlertsList = [...monitoredNames, name];
    }
    
    const updatedPrefs = {
      ...preferences,
      birthdayAlerts: wasArray ? updatedAlertsList : updatedAlertsList.join(', ')
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
        localStorage.setItem('scheduleai_preferences', JSON.stringify(data));
        addCustomToast('Sucesso', isAlreadyMonitored ? `Alerta de aniversário para ${name} desativado.` : `Alerta de aniversário para ${name} ativado!`, 'success');
      }
    } catch (err) {
      console.error('Error saving updated birthday alert preferences:', err);
      addCustomToast('Erro', 'Não foi possível salvar a preferência de alerta.', 'error');
    }
  };

  // Save birthday from modal
  const handleSaveBirthday = async () => {
    if (!birthdayContact) return;
    
    const parts = birthdayInputValue.trim().split('/');
    let formattedBday = '';
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      formattedBday = `${year}-${month}-${day}`;
    } else if (parts.length === 2) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      formattedBday = `${month}-${day}`;
    } else if (birthdayInputValue.includes('-')) {
      formattedBday = birthdayInputValue.trim();
    }
    
    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(formattedBday) || /^\d{2}-\d{2}$/.test(formattedBday);
    if (!isValid) {
      addCustomToast('Erro', 'Formato de data inválido. Use DD/MM/AAAA ou DD/MM.', 'error');
      return;
    }
    
    const contactToUpdate = birthdayContact;
    
    // Close modal first
    setBirthdayModalOpen(false);
    setBirthdayContact(null);
    setBirthdayInputValue('');
    
    try {
      const updateRes = await fetch(`${BACKEND_URL}/api/contacts/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName: contactToUpdate.resourceName,
          contactData: { birthday: formattedBday }
        })
      });
      
      if (updateRes.ok) {
        const updatedContact = await updateRes.json();
        setContacts(prev => prev.map(c => c.resourceName === contactToUpdate.resourceName ? { ...c, birthday: updatedContact.birthday } : c));
        
        // Also toggle the alert after saving successfully
        const updatedContactWithBirthday = { ...contactToUpdate, birthday: updatedContact.birthday };
        await proceedWithToggleBirthdayAlert(updatedContactWithBirthday);
        
        addCustomToast('Sucesso', 'Aniversário salvo com sucesso no Google Contacts!', 'success');
      } else {
        const errData = await updateRes.json();
        addCustomToast('Erro', `Falha ao salvar o aniversário: ${errData.error}`, 'error');
      }
    } catch (err) {
      console.error('Error updating Google contact birthday:', err);
      addCustomToast('Erro', 'Não foi possível salvar o aniversário no Google Contacts.', 'error');
    }
  };

  // Toggle birthday alert status for a contact
  const handleToggleBirthdayAlert = async (contact) => {
    if (!contact.birthday) {
      setBirthdayContact(contact);
      setBirthdayInputValue('');
      setBirthdayModalOpen(true);
      return;
    }
    await proceedWithToggleBirthdayAlert(contact);
  };

  // Handle birthday input change with automatic date mask (DD/MM/YYYY or DD/MM) for edit form
  const handleEditBirthdayChange = (e) => {
    let value = e.target.value.replace(/\D/g, ''); // only digits
    if (value.length > 8) value = value.slice(0, 8);
    
    let formatted = '';
    if (value.length > 0) {
      formatted += value.slice(0, 2);
    }
    if (value.length > 2) {
      formatted += '/' + value.slice(2, 4);
    }
    if (value.length > 4) {
      formatted += '/' + value.slice(4, 8);
    }
    setEditFormBirthday(formatted);
  };

  // Open edit contact modal
  const handleOpenEditContactModal = (contact) => {
    setEditingContact(contact);
    setEditFormName(contact.name || '');
    setEditFormPhone(contact.phone || '');
    setEditFormEmail(contact.email || '');
    setEditFormAddress(contact.address || '');
    
    // Format birthday back to DD/MM/YYYY or DD/MM for edit input
    let displayBday = '';
    if (contact.birthday) {
      const parts = contact.birthday.split('-');
      if (parts.length === 3) {
        displayBday = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else if (parts.length === 2) {
        displayBday = `${parts[1]}/${parts[0]}`;
      }
    }
    setEditFormBirthday(displayBday);
    setEditContactModalOpen(true);
  };

  // Save edited contact
  const handleSaveContactEdit = async () => {
    if (!editingContact) return;
    
    // Parse birthday formatting
    let formattedBday = '';
    if (editFormBirthday) {
      const parts = editFormBirthday.trim().split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        formattedBday = `${year}-${month}-${day}`;
      } else if (parts.length === 2) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        formattedBday = `${month}-${day}`;
      } else if (editFormBirthday.includes('-')) {
        formattedBday = editFormBirthday.trim();
      }
      
      const isValid = /^\d{4}-\d{2}-\d{2}$/.test(formattedBday) || /^\d{2}-\d{2}$/.test(formattedBday);
      if (!isValid) {
        addCustomToast('Erro', 'Formato de aniversário inválido. Use DD/MM/AAAA ou DD/MM.', 'error');
        return;
      }
    }
    
    const contactData = {
      name: editFormName,
      phone: editFormPhone,
      email: editFormEmail,
      address: editFormAddress,
      birthday: formattedBday
    };
    
    const resourceName = editingContact.resourceName;
    
    setEditContactModalOpen(false);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/contacts/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName,
          contactData
        })
      });
      
      if (res.ok) {
        const updated = await res.json();
        setContacts(prev => prev.map(c => c.resourceName === resourceName ? { ...c, ...updated } : c));
        addCustomToast('Sucesso', 'Contato atualizado com sucesso!', 'success');
      } else {
        const errData = await res.json();
        addCustomToast('Erro', `Falha ao atualizar contato: ${errData.error}`, 'error');
      }
    } catch (err) {
      console.error('Error updating contact:', err);
      addCustomToast('Erro', 'Erro de conexão ao atualizar contato.', 'error');
    }
  };

  // Delete a contact
  const handleDeleteContact = async (contact) => {
    const confirmDelete = window.confirm(`Tem certeza de que deseja excluir o contato ${contact.name}?`);
    if (!confirmDelete) return;
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/contacts/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceName: contact.resourceName })
      });
      
      if (res.ok) {
        setContacts(prev => prev.filter(c => c.resourceName !== contact.resourceName));
        addCustomToast('Sucesso', `Contato ${contact.name} excluído com sucesso!`, 'success');
      } else {
        const errData = await res.json();
        addCustomToast('Erro', `Falha ao excluir contato: ${errData.error}`, 'error');
      }
    } catch (err) {
      console.error('Error deleting contact:', err);
      addCustomToast('Erro', 'Erro de conexão ao excluir contato.', 'error');
    }
  };

  // Toggle a tag as favorite in preferences
  const handleToggleFavoriteTag = async (tagName) => {
    const currentFavorites = preferences.favoriteTags || '';
    const favoriteNames = currentFavorites.split(',').map(n => n.trim()).filter(Boolean);
    const isAlreadyFavorite = favoriteNames.some(n => n.toLowerCase() === tagName.toLowerCase());
    
    let updatedFavoritesList;
    if (isAlreadyFavorite) {
      updatedFavoritesList = favoriteNames.filter(n => n.toLowerCase() !== tagName.toLowerCase());
    } else {
      updatedFavoritesList = [...favoriteNames, tagName];
    }
    
    const updatedFavoritesString = updatedFavoritesList.join(', ');
    const updatedPrefs = {
      ...preferences,
      favoriteTags: updatedFavoritesString
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
        localStorage.setItem('scheduleai_preferences', JSON.stringify(data));
        addCustomToast('Sucesso', isAlreadyFavorite ? `Tag "${tagName}" removida dos favoritos.` : `Tag "${tagName}" favoritada!`, 'success');
      }
    } catch (err) {
      console.error('Error saving updated favorite tags preferences:', err);
      addCustomToast('Erro', 'Não foi possível salvar a preferência de favoritos.', 'error');
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
      const res = await fetch(`${BACKEND_URL}/api/auth/url?origin=${encodeURIComponent(origin)}&theme=${theme}`);
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
      const res = await fetch(`${BACKEND_URL}/api/auth/url?origin=${encodeURIComponent(origin)}&theme=${theme}`);
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
      localStorage.removeItem('scheduleai_preferences');
      setContacts([]);
      fetchTags('');
      fetchTimeline();
    } catch (err) {
      console.error('Error disconnecting Google:', err);
    }
  };

  // Move model priority up/down
  const moveModel = (index, direction) => {
    const updated = [...(preferences.modelPriority || ['gemini-2.5-flash'])];
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
    const updated = [...(preferences.modelPriority || ['gemini-2.5-flash'])];
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
      const list = [...(preferences.modelPriority || ['gemini-2.5-flash'])];
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
      localStorage.setItem('scheduleai_preferences', JSON.stringify(data));
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
      if (data.lastKeyUsed) {
        setCurrentActiveKey(data.lastKeyUsed);
      }
      if (data.lastKeyStringUsed !== undefined) {
        setCurrentActiveKeyString(data.lastKeyStringUsed);
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
      // Optimistic UI update: remove from screen immediately
      setCalculations(prev => prev.filter(c => c.eventId !== id));
      
      const res = await fetch(`${BACKEND_URL}/api/calendar/events/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro desconhecido no servidor.');
      }
      
      // Delay fetch slightly to avoid Google Calendar API race conditions
      setTimeout(() => {
        fetchTimeline();
      }, 800);

      // Add feedback chat bubble
      setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Removi o compromisso solicitado da sua agenda.' }]);
    } catch (err) {
      console.error('Error deleting event:', err);
      alert(`Falha ao excluir compromisso: ${err.message}`);
      // Rollback on failure
      fetchTimeline();
    }
  };

  // Close custom alert Toast
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Periodic User Location Tracking (Smart background GPS watch) - Mobile GPS Only
  useEffect(() => {
    const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobileDevice) {
      console.log('[LOCATION TRACKING] Non-mobile device detected. Skipping GPS tracking.');
      return;
    }

    if (!navigator.geolocation) {
      console.warn('[LOCATION TRACKING] Geolocation is not supported by this browser.');
      return;
    }

    let lastPostTime = 0;

    const handleLocationUpdate = async (position) => {
      const { latitude, longitude } = position.coords;
      const now = Date.now();
      
      // Throttle: only post once every 5 minutes (300,000 ms) to conserve battery
      if (now - lastPostTime < 5 * 60 * 1000) {
        console.log('[LOCATION TRACKING] Location watch triggered but throttled (< 5 min).');
        return;
      }
      
      lastPostTime = now;
      console.log(`[LOCATION TRACKING] WatchPosition coordinates captured: ${latitude}, ${longitude}`);
      
      try {
        const res = await fetch(`${BACKEND_URL}/api/location/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ latitude, longitude })
        });
        if (res.ok) {
          const data = await res.json();
          console.log('[LOCATION TRACKING] Saved location record:', data.record);
        } else {
          console.error('[LOCATION TRACKING] Failed to save location record.');
        }
      } catch (err) {
        console.error('[LOCATION TRACKING] Error sending location:', err);
      }
    };

    const handleError = (error) => {
      console.error('[LOCATION TRACKING] Error retrieving position:', error.message);
    };

    // Use watchPosition for high-accuracy background tracking
    const watchId = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Setup WebSockets and Load Data
  useEffect(() => {
    const handleMessage = async (e) => {
      if (e.data && e.data.type === 'auth_success' && e.data.tokens) {
        try {
          const saveRes = await fetch(`${BACKEND_URL}/api/auth/save-tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: e.data.tokens })
          });
          const saveResult = await saveRes.json();
          if (saveResult.success && saveResult.status) {
            setStatus(saveResult.status);
            addCustomToast('Sucesso', 'Conectado com sucesso ao Google Calendar!', 'success');
            fetchContacts(saveResult.status.userEmail);
            fetchTags(saveResult.status.userEmail);
            fetchTimeline();
          }
        } catch (err) {
          console.error('Failed to save tokens from postMessage:', err);
        }
      }
    };
    window.addEventListener('message', handleMessage);

    const initData = async () => {
      const initGreeting = async () => {
        // Read cached preferences to check if onboarding is completed
        const localPrefsStr = localStorage.getItem('scheduleai_preferences');
        let isOnboardingCompleted = false;
        let cachedUserName = '';
        if (localPrefsStr) {
          try {
            const parsed = JSON.parse(localPrefsStr);
            isOnboardingCompleted = parsed.onboardingStep === 'completed';
            cachedUserName = parsed.userName || '';
          } catch (e) {}
        }

        // If onboarding is completed, bypass the slow backend API greeting call and render instantly
        if (isOnboardingCompleted) {
          setChatHistory([
            {
              sender: 'assistant',
              text: cachedUserName 
                ? `E aí, **${cachedUserName}**! Como posso te ajudar hoje?` 
                : 'E aí! Como posso te ajudar hoje?'
            }
          ]);
          return;
        }

        // If onboarding is NOT completed, display connecting message and fetch onboarding step instantly
        setChatHistory([
          {
            sender: 'assistant',
            text: 'Conectando ao assistente...'
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
              text: 'E aí! Como posso te ajudar hoje?'
            }
          ]);
        }
      };
      initGreeting();

      // 2. Perform the rest of the initialization asynchronously in the background so it doesn't block the greeting
      const runRemainingInit = async () => {
        const hash = window.location.hash;
        let finalAuthStatus = null;
        if (hash && hash.startsWith('#tokens=')) {
          const base64Tokens = hash.substring(8);
          try {
            const decodedTokens = JSON.parse(atob(base64Tokens));
            window.history.replaceState(null, null, window.location.pathname);
            
            const saveRes = await fetch(`${BACKEND_URL}/api/auth/save-tokens`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: decodedTokens })
            });
            const saveResult = await saveRes.json();
            if (saveResult.success && saveResult.status) {
              finalAuthStatus = saveResult.status;
              setStatus(saveResult.status);
              addCustomToast('Sucesso', 'Conectado com sucesso ao Google Calendar!', 'success');
            }
          } catch (err) {
            console.error('Failed to parse and save tokens from hash:', err);
          }
        }

        const authStatus = finalAuthStatus || await fetchStatus();
        
        fetchTimeline();
        fetchModelHealth();
        fetchContacts(authStatus?.userEmail || '');

        if (authStatus && !authStatus.isConnected && authStatus.isConfigured) {
          console.log('[AUTO-CONNECT] User not connected. Automatically redirecting to Google Calendar connection...');
          connectGoogleRedirect();
        }
      };

      runRemainingInit().catch(err => {
        console.error('Error running remaining initialization:', err);
      });

      // Helper to save coords
      const saveOrigin = async (coords, city, timezone) => {
        console.log('Saving origin coords:', coords, 'city:', city, 'timezone:', timezone);
        const localTz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        try {
          const res = await fetch(`${BACKEND_URL}/api/preferences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              origin: coords,
              userTimezone: localTz,
              userCity: city || ''
            })
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
              await saveOrigin(data.loc, data.city, data.timezone);
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
              await saveOrigin(`${data.latitude},${data.longitude}`, data.cityName, data.timeZone);
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
            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await saveOrigin(coords, null, localTz);
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

    // Request notification permission and register for Push
    const setupNotifications = async () => {
      if ('Notification' in window) {
        try {
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }
          if (permission === 'granted') {
            const currentUrl = localStorage.getItem('backend_url') || BACKEND_URL;
            await registerPush(currentUrl);
          }
        } catch (e) {
          console.warn('Error setting up notifications:', e);
        }
      }
    };
    setupNotifications();

    // Request Capacitor native permissions if running in native wrapper
    const requestCapacitorPermissions = async () => {
      if (window.Capacitor && window.Capacitor.Plugins) {
        try {
          const { Geolocation, LocalNotifications } = window.Capacitor.Plugins;
          if (Geolocation) {
            await Geolocation.requestPermissions().catch(e => console.warn('Geo perm error:', e));
          }
          if (LocalNotifications) {
            await LocalNotifications.requestPermissions().catch(e => console.warn('Notif perm error:', e));
          }
        } catch (err) {
          console.warn('Error requesting Capacitor native permissions:', err);
        }
      }
    };
    requestCapacitorPermissions();

    // Connect socket client
    const socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
      console.log('Socket.io connected to server');
    });
    
    socket.on('auth_change', (data) => {
      console.log('Auth status changed:', data);
      setStatus(data.status);
      setPreferences(data.preferences);
      localStorage.setItem('scheduleai_preferences', JSON.stringify(data.preferences));
      if (data.lastModelUsed) {
        setCurrentActiveModel(data.lastModelUsed);
      }
      if (data.lastKeyUsed) {
        setCurrentActiveKey(data.lastKeyUsed);
      }
      if (data.lastKeyStringUsed !== undefined) {
        setCurrentActiveKeyString(data.lastKeyStringUsed);
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
      window.removeEventListener('message', handleMessage);
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
    try {
      const tz = preferences.userTimezone || undefined;
      return new Date(isoString).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: tz
      });
    } catch (e) {
      console.warn('Error formatting time with timezone:', e);
      return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  };
  const formatDate = (isoString) => {
    try {
      const tz = preferences.userTimezone || undefined;
      return new Date(isoString).toLocaleDateString('pt-BR', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short',
        timeZone: tz
      });
    } catch (e) {
      console.warn('Error formatting date with timezone:', e);
      return new Date(isoString).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    }
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
                <label>Voz do Assistente</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                  <select 
                    className="form-input" 
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px', 
                      fontSize: '13px', 
                      border: '1px solid var(--border-color)', 
                      background: 'rgba(0,0,0,0.2)', 
                      color: 'var(--text-primary)', 
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                    value={preferences.ttsVoice || 'Faber'} 
                    onChange={async (e) => {
                      const newVoice = e.target.value;
                      const updatedPrefs = { ...preferences, ttsVoice: newVoice };
                      setPreferences(updatedPrefs);
                      
                      // Auto-save preference change to backend
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
                  >
                    <option value="Faber">👨 Faber (Masculino - Local / Piper)</option>
                    <option value="Kore">👩 Kore (Feminino - Gemini Nuvem)</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleTestVoice}
                    disabled={isTestingVoice}
                    style={{ padding: '8px 12px', fontSize: '12px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isTestingVoice ? 'Ouvindo...' : 'Testar'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Velocidade da Voz: {(preferences.ttsSpeed || 1.0).toFixed(2)}x</label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.05" 
                  value={preferences.ttsSpeed || 1.0} 
                  onChange={e => setPreferences({...preferences, ttsSpeed: parseFloat(e.target.value)})}
                  style={{ width: '100%', height: '6px', cursor: 'pointer' }}
                />
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
                  value={Array.isArray(preferences.hobbies) ? preferences.hobbies.join(', ') : (preferences.hobbies || '')} 
                  onChange={e => setPreferences({...preferences, hobbies: e.target.value})}
                  placeholder="ex: jogos, shows, jazz, restaurantes, filmes"
                />
              </div>

              <div className="form-group">
                <label>Alertas de Aniversário (nomes separados por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={Array.isArray(preferences.birthdayAlerts) ? preferences.birthdayAlerts.join(', ') : (preferences.birthdayAlerts || '')} 
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
                  <strong>{Array.isArray(preferences.hobbies) ? preferences.hobbies.join(', ') : (preferences.hobbies || 'Nenhum')}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Gift size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Aniversários: </span>
                  <strong>{Array.isArray(preferences.birthdayAlerts) ? preferences.birthdayAlerts.join(', ') : (preferences.birthdayAlerts || 'Nenhum')}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Sparkles size={16} className="text-secondary" style={{ color: 'var(--accent-hover)' }} />
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>IA Principal: </span>
                  <strong>{preferences.modelPriority?.[0] || 'gemini-2.5-flash'}</strong>
                  <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--text-secondary)' }}>
                    Modelo em uso: <strong style={{ color: 'var(--success)' }}>{currentActiveModel || preferences.modelPriority?.[0] || 'gemini-2.5-flash'}</strong>
                    {currentActiveKey && (
                      <>
                        {' '}| Chave: <strong style={{ color: 'var(--success)' }} title={currentActiveKeyString || undefined}>{currentActiveKey}{currentActiveKeyString ? ` (${currentActiveKeyString})` : ''}</strong>
                      </>
                    )}
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

        {/* Android APK Download Card */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={16} style={{ color: 'var(--accent-hover)' }} />
            Instalação do Aplicativo
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
            Para usar o **Widget da Agenda na Tela Inicial** e ter rastreamento GPS preciso em background, é necessário instalar o **APK Nativo**. A versão **PWA (Web App)** é mais leve, mas não suporta Widgets de sistema do Android.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {deferredPrompt && (
              <button 
                className="btn btn-secondary" 
                onClick={async () => {
                  deferredPrompt.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  console.log(`User response to PWA install prompt: ${outcome}`);
                  setDeferredPrompt(null);
                }}
                style={{ 
                  fontSize: '12px', 
                  padding: '8px 12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '6px', 
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Instalar Versão PWA (Leve)
              </button>
            )}
            <button 
              className="btn btn-primary" 
              onClick={() => {
                const link = document.createElement('a');
                link.href = '/scheduleai.apk';
                link.download = 'scheduleai.apk';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              style={{ 
                fontSize: '12px', 
                padding: '8px 12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '6px', 
                width: '100%',
                cursor: 'pointer'
              }}
            >
              <Download size={14} /> Baixar APK Nativo (Suporta Widget)
            </button>
          </div>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '6px', gap: '8px' }}>
                  {ttsLoadingText === msg.text && (
                    <span style={{ 
                      fontSize: '11px', 
                      color: 'var(--accent-hover)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      background: 'rgba(255,255,255,0.03)', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontWeight: '500'
                    }}>
                      <Clock size={11} style={{ opacity: 0.7 }} />
                      {(ttsElapsedTime / 1000).toFixed(1)}s
                    </span>
                  )}
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
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontWeight: '500',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  outline: 'none'
                }}
                value={preferences.ttsVoice || 'Faber'}
                onChange={async (e) => {
                  const newVoice = e.target.value;
                  const updatedPrefs = { ...preferences, ttsVoice: newVoice };
                  setPreferences(updatedPrefs);
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
              >
                <option value="Faber" style={{ background: '#1c1c1e', color: '#fff' }}>Faber (Masculino - Local)</option>
                <option value="Kore" style={{ background: '#1c1c1e', color: '#fff' }}>Kore (Feminino - Gemini)</option>
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

          {isMobile && !status.isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: '100%', padding: '8px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                Conecte seu Google Calendar para começar a conversar com o assistente.
              </p>
              <button
                onClick={connectGoogle}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '24px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(123, 97, 255, 0.3)'
                }}
              >
                <Calendar size={18} />
                <span>Conectar Google Calendar</span>
              </button>
            </div>
          ) : (
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
          )}
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
          <button 
            className={`btn-tab ${activeSecondTab === 'location' ? 'active' : ''}`}
            onClick={() => { setActiveSecondTab('location'); fetchLocationHistory(selectedLocationDate); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeSecondTab === 'location' ? 'var(--accent-hover)' : 'var(--text-secondary)',
              borderBottom: activeSecondTab === 'location' ? '2px solid var(--accent-hover)' : 'none',
              paddingBottom: '6px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <MapPin size={18} />
            Localização
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

            {calculations.length > 0 && (() => {
              const now = currentTime;
              const dayEvents = calculations.map((calc, idx) => {
                const evStart = parseDateSafe(calc.eventStart);
                if (!evStart) return null;
                const evEnd = parseDateSafe(calc.eventEnd) || new Date(evStart.getTime() + 60 * 60 * 1000);
                const departure = parseDateSafe(calc.departureTime) || evStart;

                // Hide prep time if already in transit or arrived
                const isPastDeparture = now.getTime() > departure.getTime();
                const hasArrived = calc.description?.includes('[actual_arrival:') || now.getTime() > evStart.getTime();
                const hidePrep = isPastDeparture || hasArrived;

                const getReady = hidePrep ? departure : (parseDateSafe(calc.getReadyTime) || evStart);

                return {
                  ...calc,
                  evStart,
                  evEnd,
                  getReady,
                  departure,
                  eventColor: getEventColor(calc.eventId, idx)
                };
              }).filter(Boolean);

              if (dayEvents.length === 0) return null;

              // Calculate min and max times of the occupied schedule
              const minTimeMs = Math.min(...dayEvents.map(e => e.getReady.getTime()));
              const maxTimeMs = Math.max(...dayEvents.map(e => e.evEnd.getTime()));
              const totalDurationMs = maxTimeMs - minTimeMs;

              const nowMs = now.getTime();
              const showNowIndicator = nowMs >= minTimeMs && nowMs <= maxTimeMs;
              const nowPct = showNowIndicator ? ((nowMs - minTimeMs) / totalDurationMs) * 100 : 0;

              const getPctCropped = (date) => {
                if (!date) return 0;
                const timeMs = date.getTime();
                if (totalDurationMs <= 0) return 0;
                return ((timeMs - minTimeMs) / totalDurationMs) * 100;
              };

              // Collect transition ticks for the timeline scale
              const ticks = [];
              dayEvents.forEach((event) => {
                ticks.push({ time: event.getReady, pct: getPctCropped(event.getReady) });
                ticks.push({ time: event.departure, pct: getPctCropped(event.departure) });
                ticks.push({ time: event.evStart, pct: getPctCropped(event.evStart) });
                ticks.push({ time: event.evEnd, pct: getPctCropped(event.evEnd) });
              });

              // Sort and remove duplicate ticks (within 1 minute) to prevent text overlapping
              const uniqueTicks = [];
              ticks.sort((a, b) => a.time.getTime() - b.time.getTime());
              ticks.forEach((tick) => {
                if (!uniqueTicks.some(t => Math.abs(t.time.getTime() - tick.time.getTime()) < 60 * 1000)) {
                  uniqueTicks.push(tick);
                }
              });

              return (
                <div className="card glass" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ fontSize: '15px', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} /> Visualização Diária (Horários Ocupados)
                  </h3>
                  
                  {/* Legenda */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(280, 65%, 60%)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Se arrumar</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(38, 90%, 55%)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Deslocamento</span>
                    </div>
                    {dayEvents.map((event) => (
                      <div key={event.eventId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: event.eventColor }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{event.summary}</span>
                      </div>
                    ))}
                  </div>

                  {/* Grid Gráfico Cropped */}
                  <div style={{ position: 'relative', height: '48px', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                    
                    {/* Render color segments for all events */}
                    {dayEvents.map((event) => {
                      const prepWidth = getPctCropped(event.departure) - getPctCropped(event.getReady);
                      const transitWidth = getPctCropped(event.evStart) - getPctCropped(event.departure);
                      const apptWidth = getPctCropped(event.evEnd) - getPctCropped(event.evStart);

                      return (
                        <React.Fragment key={event.eventId}>
                          {/* Se arrumar (prep) */}
                          {prepWidth > 0 && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: '8px',
                                height: '32px',
                                left: `${getPctCropped(event.getReady)}%`,
                                width: `${prepWidth}%`,
                                backgroundColor: 'hsl(280, 65%, 60%)',
                                borderRadius: '4px 0 0 4px',
                                opacity: 0.85,
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '9px',
                                fontWeight: '700',
                                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                overflow: 'hidden'
                              }}
                              title={`Se arrumar: ${formatTime(event.getReady)} - ${formatTime(event.departure)}`}
                            >
                              <span style={{
                                width: '100%',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '0 4px',
                                display: 'block'
                              }}>
                                Se arrumar
                              </span>
                            </div>
                          )}

                          {/* Deslocamento */}
                          {transitWidth > 0 && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: '8px',
                                height: '32px',
                                left: `${getPctCropped(event.departure)}%`,
                                width: `${transitWidth}%`,
                                backgroundColor: 'hsl(38, 90%, 55%)',
                                opacity: 0.9,
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '9px',
                                fontWeight: '700',
                                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                overflow: 'hidden'
                              }}
                              title={`Deslocamento: ${formatTime(event.departure)} - ${formatTime(event.evStart)} (${event.travelData?.durationText || ''})`}
                            >
                              <span style={{
                                width: '100%',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '0 4px',
                                display: 'block'
                              }}>
                                Deslocamento
                              </span>
                            </div>
                          )}

                          {/* Appointment */}
                          {apptWidth > 0 && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: '8px',
                                height: '32px',
                                left: `${getPctCropped(event.evStart)}%`,
                                width: `${apptWidth}%`,
                                backgroundColor: event.eventColor,
                                borderRadius: transitWidth > 0 ? '0 4px 4px 0' : '4px',
                                zIndex: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '9px',
                                fontWeight: '700',
                                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                overflow: 'hidden'
                              }}
                              title={`${event.summary}: ${formatTime(event.evStart)} - ${formatTime(event.evEnd)}`}
                            >
                              <span style={{
                                width: '100%',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '0 4px',
                                display: 'block'
                              }}>
                                {event.summary}
                              </span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Current time indicator line */}
                    {showNowIndicator && (
                      <div 
                        style={{
                          position: 'absolute',
                          left: `${nowPct}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          backgroundColor: '#ef4444',
                          boxShadow: '0 0 8px rgba(239, 68, 68, 0.9)',
                          zIndex: 10,
                          pointerEvents: 'none'
                        }}
                        title={`Agora: ${formatTime(now)}`}
                      />
                    )}
                  </div>

                  {/* Ticks Scale similar to Visual Timeline */}
                  <div style={{ position: 'relative', height: '18px', fontSize: '9px', color: 'var(--text-secondary)', fontWeight: '500', marginTop: '-8px' }}>
                    {uniqueTicks.map((tick, tIdx) => {
                      const isFirst = tIdx === 0;
                      const isLast = tIdx === uniqueTicks.length - 1;
                      
                      return (
                        <span 
                          key={tIdx} 
                          style={{ 
                            position: 'absolute', 
                            left: `${tick.pct}%`, 
                            transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {formatTime(tick.time)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div 
              ref={appointmentsContainerRef}
              className="timeline-grid"
              style={{
                maxHeight: '520px',
                overflowY: 'auto',
                paddingRight: '6px',
                scrollBehavior: 'smooth'
              }}
            >
              {calculations.length === 0 ? (
                <div className="card glass" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                  <Calendar size={36} />
                  <span>Nenhum compromisso agendado para as próximas 12 horas.</span>
                  <span style={{ fontSize: '12px' }}>Use {isMobile ? 'a aba Conversa' : 'o chat assistente ao lado'} para agendar novos eventos!</span>
                </div>
              ) : (
                calculations.map((calc, idx) => (
                  <div 
                    key={calc.eventId} 
                    data-event-id={calc.eventId}
                    className="card event-card has-triggers glass"
                    style={{ borderLeft: `4px solid ${getEventColor(calc.eventId, idx)}` }}
                  >
                    <div className="event-header">
                      <span className="event-time">
                        {(() => { const d = formatDate(calc.eventStart); return d.charAt(0).toUpperCase() + d.slice(1); })()} {formatTime(calc.eventStart)} - {formatTime(calc.eventEnd || new Date(new Date(calc.eventStart).getTime() + 60 * 60 * 1000))}
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

                    {calc.location && calc.travelData && (() => {
                      const now = currentTime;
                      const evStart = parseDateSafe(calc.eventStart);
                      if (!evStart) return null;

                      const evEnd = parseDateSafe(calc.eventEnd) || new Date(evStart.getTime() + 60 * 60 * 1000);
                      const departure = parseDateSafe(calc.departureTime) || evStart;

                      // Hide prep time if already in transit or arrived
                      const isPastDeparture = now.getTime() > departure.getTime();
                      const hasArrived = calc.description?.includes('[actual_arrival:') || now.getTime() > evStart.getTime();
                      const hidePrep = isPastDeparture || hasArrived;

                      const getReady = hidePrep ? departure : (parseDateSafe(calc.getReadyTime) || evStart);

                      const prepDur = Math.max(0, Math.round((departure.getTime() - getReady.getTime()) / (60 * 1000)));
                      const transitDur = Math.max(0, Math.round((evStart.getTime() - departure.getTime()) / (60 * 1000)));
                      const apptDur = Math.max(0, Math.round((evEnd.getTime() - evStart.getTime()) / (60 * 1000)));
                      
                      const totalMinutes = prepDur + transitDur + apptDur;
                      const prepPct = totalMinutes > 0 ? (prepDur / totalMinutes) * 100 : 0;
                      const transitPct = totalMinutes > 0 ? (transitDur / totalMinutes) * 100 : 0;
                      const apptPct = totalMinutes > 0 ? (apptDur / totalMinutes) * 100 : 0;
                      
                      const eventStartMs = getReady.getTime();
                      const eventEndMs = evEnd.getTime();
                      const eventDurationMs = eventEndMs - eventStartMs;
                      const isNowInEvent = now.getTime() >= eventStartMs && now.getTime() <= eventEndMs;
                      const nowEventPct = isNowInEvent && eventDurationMs > 0 
                        ? ((now.getTime() - eventStartMs) / eventDurationMs) * 100 
                        : 0;
                      
                      const posB = prepPct;
                      const posC = prepPct + transitPct;
                      
                      const eventColor = getEventColor(calc.eventId, idx);

                      return (
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          
                          {/* Triggers indicator list */}
                          <div className="trigger-indicator" style={{ marginBottom: '4px' }}>
                            <div className="trigger-step" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Trânsito ({calc.travelData.distanceText}):</span>
                              <span className="time" style={{ color: 'var(--accent-hover)' }}>{calc.travelData.durationText}</span>
                            </div>
                            <div className="trigger-step">
                              <span>👔 Se Arrume (1h antes):</span>
                              <span className="time">{formatTime(getReady)}</span>
                            </div>
                            <div className="trigger-step">
                              <span>🔔 Aviso de Saída (15m antes):</span>
                              <span className="time">{formatTime(parseDateSafe(calc.warnLeaveTime) || departure)}</span>
                            </div>
                            <div className="trigger-step" style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                              <span>🚗 Horário de Saída:</span>
                              <span className="time">{formatTime(departure)}</span>
                            </div>
                          </div>

                          {/* Graphical Segmented Timeline Bar */}
                          <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} /> LINHA DO TEMPO VISUAL
                            </div>

                            {/* Bar segment container */}
                            <div style={{ position: 'relative', display: 'flex', height: '12px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                              {prepPct > 0 && (
                                <div style={{ width: `${prepPct}%`, backgroundColor: 'hsl(280, 65%, 60%)' }} title={`Se arrumar: ${prepDur} min`} />
                              )}
                              {transitPct > 0 && (
                                <div style={{ width: `${transitPct}%`, backgroundColor: 'hsl(38, 90%, 55%)' }} title={`Deslocamento: ${transitDur} min`} />
                              )}
                              {apptPct > 0 && (
                                <div style={{ width: `${apptPct}%`, backgroundColor: eventColor }} title={`Compromisso: ${apptDur} min`} />
                              )}

                              {/* Current time indicator line */}
                              {isNowInEvent && (
                                <div 
                                  style={{
                                    position: 'absolute',
                                    left: `${nowEventPct}%`,
                                    top: 0,
                                    bottom: 0,
                                    width: '2px',
                                    backgroundColor: '#ef4444',
                                    boxShadow: '0 0 6px rgba(239, 68, 68, 0.9)',
                                    zIndex: 5,
                                    pointerEvents: 'none'
                                  }}
                                  title={`Agora: ${formatTime(now)}`}
                                />
                              )}
                            </div>

                            {/* Timeline hours ticks scale */}
                            <div style={{ position: 'relative', height: '16px', fontSize: '9px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              {prepPct > 0 && (
                                <span style={{ position: 'absolute', left: '0%', transform: 'translateX(0%)' }}>
                                  {formatTime(getReady)}
                                </span>
                              )}
                              <span style={{ position: 'absolute', left: `${posB}%`, transform: 'translateX(-50%)' }}>
                                {formatTime(departure)}
                              </span>
                              <span style={{ position: 'absolute', left: `${posC}%`, transform: 'translateX(-50%)' }}>
                                {formatTime(evStart)}
                              </span>
                              <span style={{ position: 'absolute', right: '0%', transform: 'translateX(0%)' }}>
                                {formatTime(evEnd)}
                              </span>
                            </div>

                            {/* Phase labels */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px' }}>
                              {prepPct > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(280, 65%, 60%)' }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>Se Arrumar</span>
                                  </div>
                                  <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{formatTime(getReady)} - {formatTime(departure)} ({prepDur}m)</span>
                                </div>
                              )}
                              {transitPct > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(38, 90%, 55%)' }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>Deslocamento</span>
                                  </div>
                                  <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{formatTime(departure)} - {formatTime(evStart)} ({transitDur}m)</span>
                                </div>
                              )}
                              {apptPct > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: eventColor }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>Compromisso</span>
                                  </div>
                                  <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{formatTime(evStart)} - {formatTime(evEnd)} ({apptDur}m)</span>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      );
                    })()}

                    {(() => {
                      const arrivalMatch = calc.description?.match(/\[actual_arrival:([^\]]+)\]/);
                      const departureMatch = calc.description?.match(/\[actual_departure:([^\]]+)\]/);
                      const actualArrival = arrivalMatch ? new Date(arrivalMatch[1]) : null;
                      const actualDeparture = departureMatch ? new Date(departureMatch[1]) : null;

                      if (!actualArrival && !actualDeparture) return null;

                      return (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px',
                          background: 'rgba(79, 70, 229, 0.05)',
                          border: '1px dashed rgba(79, 70, 229, 0.2)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {actualArrival && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                              <span>📥 Chegada registrada:</span>
                              <strong>{actualArrival.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</strong>
                            </div>
                          )}
                          {actualDeparture && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-hover)' }}>
                              <span>📤 Saída registrada:</span>
                              <strong>{actualDeparture.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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
        ) : activeSecondTab === 'contacts' ? (
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
                style={{ width: '100%', marginBottom: '12px' }}
              />
              
              {/* Tag Filter Pills and Settings Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedFilterTag('Todos')}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      border: '1px solid var(--border-color)',
                      background: selectedFilterTag === 'Todos' ? 'var(--accent-hover)' : 'rgba(255, 255, 255, 0.02)',
                      color: selectedFilterTag === 'Todos' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: selectedFilterTag === 'Todos' ? 'bold' : 'normal',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Todos
                  </button>
                  {allTags.map(tag => {
                    const isSelected = selectedFilterTag === tag.name;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedFilterTag(tag.name)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          border: '1px solid var(--border-color)',
                          background: isSelected ? 'var(--accent-hover)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? '#fff' : 'var(--text-secondary)',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {tag.name} {tag.type === 'global' ? '' : '🔒'}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setShowTagSettingsModal(true)}
                  style={{
                    padding: '8px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  title="Configurar Tags"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isLoadingContacts && contacts.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-hover)' }} />
                </div>
              ) : (() => {
                const filtered = contacts.filter(contact => {
                  // Search query filter
                  const q = contactSearchQuery.toLowerCase();
                  const matchesQuery = 
                    contact.name.toLowerCase().includes(q) ||
                    (contact.email && contact.email.toLowerCase().includes(q)) ||
                    (contact.phone && contact.phone.includes(q));
                  
                  if (!matchesQuery) return false;

                  // Tag filter
                  if (selectedFilterTag === 'Todos') return true;
                  return contact.tags && contact.tags.includes(selectedFilterTag);
                }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

                if (filtered.length === 0) {
                  return (
                    <div className="card glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                      <Users size={36} />
                      <span>{contacts.length === 0 ? 'Nenhum contato encontrado na agenda.' : 'Nenhum contato coincide com a busca ou filtro.'}</span>
                    </div>
                  );
                }

                let monitoredNames = [];
                if (preferences.birthdayAlerts) {
                  if (Array.isArray(preferences.birthdayAlerts)) {
                    monitoredNames = preferences.birthdayAlerts.map(n => n.trim().toLowerCase()).filter(Boolean);
                  } else if (typeof preferences.birthdayAlerts === 'string') {
                    monitoredNames = preferences.birthdayAlerts.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
                  }
                }

                return filtered.map(contact => {
                  const isMonitored = monitoredNames.includes(contact.name.toLowerCase());
                  
                  let mapsLink = '';
                  if (contact.address) {
                    mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address.trim())}`;
                  }

                  // Compute visible favorite tags for quick toggle buttons
                  const currentFavorites = preferences.favoriteTags || '';
                  const favoriteNames = currentFavorites.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
                  const visibleFavoriteTagNames = allTags
                    .filter(tag => favoriteNames.includes(tag.name.toLowerCase()))
                    .map(tag => tag.name);

                  return (
                    <div key={contact.resourceName} className="card glass hover-lift" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', rowGap: '4px', width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '15px', flexShrink: 0, lineHeight: '1.1' }}>
                                  {contact.name}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                                  <button
                                    onClick={() => handleOpenEditContactModal(contact)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '2px',
                                      cursor: 'pointer',
                                      color: 'var(--text-secondary)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      transition: 'color 0.2s'
                                    }}
                                    title="Editar Contato"
                                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteContact(contact)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '2px',
                                      cursor: 'pointer',
                                      color: 'var(--danger)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      transition: 'color 0.2s'
                                    }}
                                    title="Excluir Contato"
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ff6b6b'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--danger)'}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              
                              <button 
                                className={`btn ${isMonitored ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => handleToggleBirthdayAlert(contact)}
                                style={{ 
                                  padding: '4px 10px', 
                                  fontSize: '11px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  borderRadius: '20px',
                                  background: isMonitored ? 'rgba(235, 94, 85, 0.2)' : 'rgba(255,255,255,0.03)',
                                  color: isMonitored ? '#eb5e55' : 'var(--text-secondary)',
                                  border: isMonitored ? '1px solid #eb5e55' : '1px solid var(--border-color)',
                                  height: '24px',
                                  marginLeft: 'auto'
                                }}
                                title={isMonitored ? 'Alerta de Aniversário Ativo' : 'Ativar Alerta de Aniversário'}
                              >
                                <Cake size={11} style={{ color: isMonitored ? '#eb5e55' : 'var(--text-secondary)' }} />
                                <span>{isMonitored ? 'Alerta Ativo' : 'Lembrar Aniversário'}</span>
                              </button>
                            </div>

                            {/* Row 2: Phone (left) and Tags (right) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '2px', minHeight: '24px' }}>
                              {contact.phone ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                  <span>{contact.phone}</span>
                                </div>
                              ) : (
                                <div></div>
                              )}
                              
                              {/* Tags container aligned to the right */}
                              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', rowGap: '2px', justifyContent: 'flex-end', marginLeft: 'auto', alignItems: 'center' }}>
                                {/* Favorite Tags Quick Toggles */}
                                {visibleFavoriteTagNames.map(tagName => {
                                  const isAssociated = (contact.tags || []).includes(tagName);
                                  
                                  // Color scheme for active tag
                                  let activeBg = 'rgba(156, 39, 176, 0.15)';
                                  let activeFg = '#9c27b0';
                                  let activeBorder = '1px solid #9c27b0';
                                  
                                  if (tagName.toLowerCase() === 'amigo') {
                                    activeBg = 'rgba(76, 175, 80, 0.15)';
                                    activeFg = '#4caf50';
                                    activeBorder = '1px solid #4caf50';
                                  } else if (tagName.toLowerCase() === 'pessoal') {
                                    activeBg = 'rgba(33, 150, 243, 0.15)';
                                    activeFg = '#2196f3';
                                    activeBorder = '1px solid #2196f3';
                                  } else if (tagName.toLowerCase() === 'trabalho') {
                                    activeBg = 'rgba(244, 67, 54, 0.15)';
                                    activeFg = '#f44336';
                                    activeBorder = '1px solid #f44336';
                                  } else if (tagName.toLowerCase() === 'família' || tagName.toLowerCase() === 'familia') {
                                    activeBg = 'rgba(255, 152, 0, 0.15)';
                                    activeFg = '#ff9800';
                                    activeBorder = '1px solid #ff9800';
                                  }

                                  return (
                                    <button
                                      key={`quick-${tagName}`}
                                      onClick={() => handleToggleContactTag(contact, tagName)}
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: isAssociated ? activeBg : 'rgba(255, 255, 255, 0.03)',
                                        color: isAssociated ? activeFg : 'var(--text-secondary)',
                                        border: isAssociated ? activeBorder : '1px solid var(--border-color)',
                                        transition: 'all 0.2s ease',
                                        height: '22px',
                                        lineHeight: '1'
                                      }}
                                      title={isAssociated ? `Remover tag "${tagName}"` : `Adicionar tag "${tagName}"`}
                                    >
                                      <span>{tagName}</span>
                                    </button>
                                  );
                                })}

                                {/* Custom contact tag badges (not in favorites) */}
                                {contact.tags && contact.tags.filter(t => !favoriteNames.includes(t.toLowerCase())).map(tagName => {
                                  let bg = 'rgba(156, 39, 176, 0.15)';
                                  let fg = '#9c27b0';
                                  return (
                                    <span key={tagName} style={{
                                      padding: '2px 8px',
                                      fontSize: '10px',
                                      borderRadius: '4px',
                                      background: bg,
                                      color: fg,
                                      fontWeight: '600',
                                      display: 'inline-block',
                                      height: '18px',
                                      lineHeight: '14px'
                                    }}>
                                      {tagName}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            
                            {/* Row 3: Rest of contact details (email, address, birthday) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {contact.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Mail size={12} style={{ color: 'var(--accent-hover)' }} />
                                  <span>{contact.email}</span>
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
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        ) : activeSecondTab === 'location' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <style>{`
              @keyframes pin-pulse {
                0% { transform: scale(0.5); opacity: 0; }
                50% { opacity: 0.6; }
                100% { transform: scale(1.8); opacity: 0; }
              }
            `}</style>
            
            {/* Background Permission Prompt Card */}
            <div className="card glass" style={{ 
              padding: '14px', 
              background: 'rgba(245, 158, 11, 0.07)', 
              border: '1px solid rgba(245, 158, 11, 0.25)', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontWeight: '600', fontSize: '13px' }}>
                <AlertTriangle size={16} />
                <span>Rastreamento em Background (GPS)</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                Para registrar de forma contínua seus horários de chegada e saída mesmo com a tela bloqueada, configure a permissão do aplicativo para <strong>"Permitir o Tempo Todo" (Sempre)</strong> nas configurações de localização do celular.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.02)' }}
                  onClick={() => setShowGPSHelpModal(true)}
                >
                  <Info size={12} /> Como ativar permissão "Sempre" no celular
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                  onClick={() => {
                    const startTime = Date.now();
                    let appOpened = false;

                    const handleVisibility = () => {
                      if (document.hidden) {
                        appOpened = true;
                      }
                    };
                    document.addEventListener("visibilitychange", handleVisibility);

                    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                      window.Capacitor.Plugins.App.openAppSettings().catch(() => {});
                    } else {
                      const isAndroid = /Android/i.test(navigator.userAgent);
                      if (isAndroid) {
                        // Try opening the specific app settings
                        window.location.href = "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.scheduleai.app;end";
                        
                        // Fallback to global location settings if the app didn't go to background
                        setTimeout(() => {
                          document.removeEventListener("visibilitychange", handleVisibility);
                          if (!appOpened && (Date.now() - startTime) < 2200) {
                            console.log("App settings intent did not trigger. Falling back to global location settings.");
                            window.location.href = "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end";
                          }
                        }, 1500);
                      } else {
                        alert("Para habilitar o rastreamento em segundo plano no iOS: Vá em Ajustes > Privacidade > Serviços de Localização > ScheduleAI e selecione 'Sempre'.");
                      }
                    }
                  }}
                >
                  <Settings size={12} /> Abrir Configurações do App
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MapPin size={20} style={{ color: 'var(--accent-primary)' }} />
                <h2 style={isMobile ? { fontSize: '18px', margin: 0 } : { margin: 0 }}>Histórico de Localização</h2>
              </div>
              
              {/* Seletor de Data e Navegação */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => navigateDay(-1)}>
                  Anterior
                </button>
                <input 
                  type="date" 
                  className="form-input" 
                  style={{ padding: '6px 12px', fontSize: '14px', width: 'auto', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', borderRadius: '6px' }}
                  value={selectedLocationDate}
                  onChange={(e) => {
                    setSelectedLocationDate(e.target.value);
                    fetchLocationHistory(e.target.value);
                  }}
                />
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => navigateDay(1)}>
                  Próximo
                </button>
              </div>
            </div>

            {/* Container do Mapa */}
            <div className="card glass" style={{ padding: '12px', position: 'relative', overflow: 'hidden' }}>
              {isLoadingLocations && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '8px' }}>
                  <RefreshCw size={24} className="spin-anim" />
                </div>
              )}
              
              <div 
                ref={mapContainerRef} 
                style={{ 
                  height: '450px', 
                  width: '100%', 
                  borderRadius: '6px', 
                  backgroundColor: '#111', 
                  border: '1px solid rgba(255,255,255,0.06)',
                  zIndex: 1
                }} 
              />
            </div>

            {/* Lista de Pontos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '10px 0 0 0' }}>
                Pontos Registrados ({locationHistory.length})
              </h3>
              
              {locationHistory.length === 0 ? (
                <div className="card glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
                  <MapPin size={24} style={{ marginBottom: '8px' }} />
                  <span>Nenhum ponto de localização registrado para esta data.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {locationHistory.map((loc, idx) => (
                    <div 
                      key={idx} 
                      className="card glass" 
                      style={{ 
                        padding: '10px 14px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        fontSize: '13px',
                        cursor: 'pointer',
                        borderLeft: idx === locationHistory.length - 1 ? '3px solid var(--accent-primary)' : '3px solid hsl(142, 60%, 45%)'
                      }}
                      onClick={() => {
                        if (mapInstanceRef.current) {
                          if (window.google && window.google.maps) {
                            mapInstanceRef.current.setCenter({ lat: loc.latitude, lng: loc.longitude });
                            mapInstanceRef.current.setZoom(16);
                          }
                        }
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{loc.time} {idx === locationHistory.length - 1 && <span style={{ color: 'var(--accent-hover)', fontSize: '11px', marginLeft: '6px' }}>(Mais recente)</span>}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.address}</span>
                      </div>
                      {loc.observations && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {loc.observations}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
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

      {showTagSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowTagSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Configuração de Tags de Contatos</h3>
              <button className="modal-close" onClick={() => setShowTagSettingsModal(false)}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                Crie tags para organizar seus contatos. Tags criadas por você são privadas (🔒) e visíveis apenas na sua conta.
                {status.userEmail === 'rafael.lucatto@gmail.com' && " Como administrador, você também pode criar tags globais."}
              </p>
              
              {/* Form to create new tag */}
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newTagNameInput.trim()) return;
                  await handleCreateTag(newTagNameInput, newTagTypeInput);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)' }}>
                  Criar Nova Tag:
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="Nome da tag..."
                    value={newTagNameInput}
                    onChange={e => setNewTagNameInput(e.target.value)}
                    style={{ flex: 1 }}
                    required
                  />
                  {status.userEmail === 'rafael.lucatto@gmail.com' && (
                    <select 
                      className="form-input"
                      value={newTagTypeInput}
                      onChange={e => setNewTagTypeInput(e.target.value)}
                      style={{ width: '120px' }}
                    >
                      <option value="private">Privada</option>
                      <option value="global">Global</option>
                    </select>
                  )}
                </div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', padding: '8px 16px' }}>
                  Criar Tag
                </button>
              </form>

              {/* Tag List */}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Tags Disponíveis:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {allTags.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhuma tag cadastrada.</div>
                  ) : (
                    allTags.map(tag => {
                      const currentFavorites = preferences.favoriteTags || '';
                      const favoriteNames = currentFavorites.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
                      const isFavorite = favoriteNames.includes(tag.name.toLowerCase());

                      return (
                        <div 
                          key={tag.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.01)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleToggleFavoriteTag(tag.name)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: isFavorite ? '#ffc107' : 'rgba(255, 255, 255, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s ease'
                              }}
                              title={isFavorite ? 'Remover dos Favoritos' : 'Favoritar Tag'}
                            >
                              <Star size={16} fill={isFavorite ? '#ffc107' : 'none'} />
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                              {tag.name}
                            </span>
                          </div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              fontSize: '11px', 
                              background: tag.type === 'global' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(33, 150, 243, 0.15)',
                              color: tag.type === 'global' ? '#4caf50' : '#2196f3',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              {tag.type === 'global' ? 'Global' : 'Privada 🔒'}
                            </span>
                            {(status.userEmail === 'rafael.lucatto@gmail.com' || (tag.owner && tag.owner.toLowerCase() === (status.userEmail || '').toLowerCase())) && (
                              <button
                                onClick={() => handleDeleteTag(tag.name)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  color: 'var(--danger)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s ease',
                                  opacity: 0.7
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                                title="Excluir Tag"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setShowTagSettingsModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Birthday Input Modal */}
      {birthdayModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div className="glass" style={{
            width: '90%',
            maxWidth: '400px',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            background: 'rgba(23, 23, 23, 0.85)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            padding: '24px',
            animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cake size={20} style={{ color: 'var(--warning)' }} />
                Cadastrar Aniversário
              </h3>
              <button 
                onClick={() => { setBirthdayModalOpen(false); setBirthdayContact(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: '1',
                  padding: '4px'
                }}
              >
                &times;
              </button>
            </div>
            
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>
              Insira a data de aniversário de <strong>{birthdayContact?.name}</strong> para poder ativar os alertas.
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Data de Aniversário
              </label>
              <input
                type="text"
                placeholder="DD/MM/AAAA ou DD/MM"
                value={birthdayInputValue}
                onChange={handleBirthdayInputChange}
                className="input"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setBirthdayModalOpen(false); setBirthdayContact(null); }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveBirthday}
                disabled={!birthdayInputValue}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GPS Background Help Modal */}
      {showGPSHelpModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div className="glass" style={{
            width: '90%',
            maxWidth: '500px',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            background: 'rgba(23, 23, 23, 0.9)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            padding: '24px',
            maxHeight: '90vh',
            overflowY: 'auto',
            animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={20} style={{ color: 'var(--accent-hover)' }} />
                Permissão de GPS "O tempo todo"
              </h3>
              <button 
                onClick={() => setShowGPSHelpModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: '1',
                  padding: '4px'
                }}
              >
                &times;
              </button>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>
              O rastreamento em segundo plano é necessário para o assistente registrar seus horários reais de chegada e saída na agenda de forma autônoma. Siga os passos de configuração abaixo:
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🤖 Android</span>
              </div>
              <ol style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Abra as <strong>Configurações</strong> do celular.</li>
                <li>Vá em <strong>Aplicativos</strong> e selecione o navegador usado (ex: Chrome, Edge, Samsung Internet) ou o PWA <strong>ScheduleAI</strong>.</li>
                <li>Toque em <strong>Permissões</strong> &gt; <strong>Localização</strong>.</li>
                <li>Selecione a opção <strong>"Permitir o tempo todo"</strong> (Allow all the time) e marque a opção <strong>"Usar localização precisa"</strong>.</li>
              </ol>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🍎 iOS (iPhone)</span>
              </div>
              <ol style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Abra os <strong>Ajustes</strong> do iPhone.</li>
                <li>Vá em <strong>Privacidade e Segurança</strong> &gt; <strong>Serviços de Localização</strong>.</li>
                <li>Selecione o navegador utilizado (ex: Safari, Chrome) ou o app <strong>ScheduleAI</strong>.</li>
                <li>Mude a opção para <strong>"Sempre"</strong> (Always) e certifique-se de que a chave <strong>"Localização Precisa"</strong> esteja ativada.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowGPSHelpModal(false)}
                style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px' }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editContactModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div className="glass" style={{
            width: '90%',
            maxWidth: '450px',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            background: 'rgba(23, 23, 23, 0.85)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            padding: '24px',
            animation: 'scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={20} style={{ color: 'var(--accent-hover)' }} />
                Editar Contato
              </h3>
              <button 
                onClick={() => { setEditContactModalOpen(false); setEditingContact(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: '1',
                  padding: '4px'
                }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Nome
                </label>
                <input
                  type="text"
                  value={editFormName}
                  onChange={(e) => setEditFormName(e.target.value)}
                  className="input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Telefone
                </label>
                <input
                  type="text"
                  value={editFormPhone}
                  onChange={(e) => setEditFormPhone(e.target.value)}
                  className="input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={editFormEmail}
                  onChange={(e) => setEditFormEmail(e.target.value)}
                  className="input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Endereço
                </label>
                <input
                  type="text"
                  value={editFormAddress}
                  onChange={(e) => setEditFormAddress(e.target.value)}
                  className="input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Aniversário
                </label>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA ou DD/MM"
                  value={editFormBirthday}
                  onChange={handleEditBirthdayChange}
                  className="input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setEditContactModalOpen(false); setEditingContact(null); }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveContactEdit}
                disabled={!editFormName}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Salvar
              </button>
            </div>
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
