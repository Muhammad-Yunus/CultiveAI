import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Search,
  Mic,
  Lightbulb,
  Download,
  Bell,
  Moon,
  Sun,
  Droplet,
  Calendar,
  SlidersHorizontal,
  FileText,
  Hash,
  Settings,
  ArrowUpRight,
  Thermometer,
  Sprout,
  Zap,
  TrendingUp,
  Droplets,
  Wind,
} from 'lucide-react';

import { HarvestAiGauge } from './components/HarvestAiGauge';
import {
  WaterFlowChart,
  PowerConsumptionChart,
  GrowthRateChart,
  AirCo2Chart,
} from './components/Charts';
import {
  AuthModal,
  MetricDetailModal,
  AiAssistantDrawer,
  AlertsModal,
  InsightsModal,
} from './components/Modals';
import {
  WaterAnalyticsView,
  ScheduleView,
  ControlsView,
  LogsAndSwaggerView,
  ZonesAndKeysView,
} from './components/SecondaryViews';
import type {
  AlertItem,
  DashboardOverview,
  MetricKey,
  NavTab,
  TelemetryReading,
  UserProfile,
} from './types/telemetry';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);

  // User Auth strictly held in React memory (never localStorage)
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Modals & Drawers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const fetchOverview = useCallback(async (zoneId?: number) => {
    try {
      const targetId = zoneId ?? activeZoneId;
      const res = await fetch(`/api/telemetry/overview?zoneId=${targetId}`);
      if (res.ok) {
        const data = (await res.json()) as DashboardOverview;
        setOverview(data);
        if (data.activeZoneId) {
          setActiveZoneId(data.activeZoneId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch telemetry overview:', err);
    } finally {
      setLoading(false);
    }
  }, [activeZoneId]);

  useEffect(() => {
    fetchOverview(activeZoneId);
  }, [fetchOverview, activeZoneId]);

  // Real-time Socket.IO bi-directional synchronization
  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('zone:subscribe', { zoneId: activeZoneId });
    });

    socket.on(
      'telemetry:new',
      (payload: { reading: TelemetryReading; alerts?: AlertItem[] }) => {
        const incoming = payload?.reading;
        if (!incoming) return;
        setOverview((prev) => {
          if (!prev || incoming.zoneId !== prev.activeZoneId) return prev;
          const alreadyExists = prev.history.some((r) => r.id === incoming.id);
          const nextHistory = alreadyExists
            ? prev.history
            : [...prev.history.slice(-47), incoming];
          const incomingAlerts = payload.alerts ?? [];
          const mergedAlerts =
            incomingAlerts.length > 0
              ? [...incomingAlerts, ...prev.alerts].slice(0, 20)
              : prev.alerts;
          return {
            ...prev,
            latest: incoming,
            history: nextHistory,
            alerts: mergedAlerts,
          };
        });
      }
    );

    socket.on('telemetry:batch', (payload: { latest?: TelemetryReading }) => {
      if (payload?.latest) {
        fetchOverview(payload.latest.zoneId);
      }
    });

    socket.on('zone:updated', (payload: { zoneId?: number }) => {
      if (!payload?.zoneId || payload.zoneId === activeZoneId) {
        fetchOverview(activeZoneId);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, activeZoneId, fetchOverview]);

  function handleVoiceSearch() {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (typeof SpeechRecognition !== 'function') {
      searchInputRef.current?.focus();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    setVoiceActive(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) {
        setSearchQuery(transcript);
      }
      setVoiceActive(false);
    };
    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);
    recognition.start();
  }

  async function handleExportCsv() {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    const res = await fetch(`/api/telemetry/export?zoneId=${activeZoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cultivai-telemetry.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleAcknowledgeAlert(alertId: number) {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    const res = await fetch(`/api/alerts/${alertId}/ack`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchOverview(activeZoneId);
    }
  }

  const latest = overview?.latest ?? null;
  const history = overview?.history ?? [];
  const alertsList = overview?.alerts ?? [];
  const unackedCount = alertsList.filter((a) => !a.acknowledged).length;

  // Match KPI visibility against search filter if user types in Search...
  const q = searchQuery.trim().toLowerCase();
  const matchesFilter = (label: string) => !q || label.toLowerCase().includes(q);

  const navItems: Array<{ id: NavTab; label: string; icon: typeof Droplet }> = [
    { id: 'overview', label: 'Overview', icon: Droplet }, // custom house-leaf rendered for overview
    { id: 'water', label: 'Water & EC', icon: Droplet },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'controls', label: 'Controls', icon: SlidersHorizontal },
    { id: 'logs', label: 'Swagger & Logs', icon: FileText },
    { id: 'keys', label: 'Zones & API Keys', icon: Hash },
  ];

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-[radial-gradient(circle_at_12%_12%,#DCECE2_0%,#ECF4EF_42%,#E2ECE6_100%)] dark:bg-[radial-gradient(circle_at_12%_12%,#132018_0%,#0B110D_55%,#090E0B_100%)] text-[#151D18] dark:text-[#ECF3EE] transition-colors duration-200">
      {/* Main Viewport Shell */}
      <div className="max-w-[1440px] mx-auto min-h-screen px-3 sm:px-5 lg:px-6 pt-3 sm:pt-4 pb-20 lg:pb-5 flex flex-col gap-3.5 sm:gap-4">
        {/* TOP BAR */}
        <header className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
          {/* Brand Zone */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B9B42] rounded-2xl pr-1"
          >
            <div className="w-10 h-10 rounded-[14px] bg-white/88 dark:bg-[#16211A] border border-white/90 dark:border-white/10 shadow-[0_4px_16px_rgba(20,40,25,0.05)] flex items-center justify-center shrink-0">
              {/* Custom Greenhouse Botanical Brand Mark */}
              <svg
                viewBox="0 0 28 28"
                className="w-6 h-6"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.5 13L14 5.5L23.5 13V22.5H4.5V13Z"
                  stroke="#3E7229"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  fill="#EBF5E5"
                />
                <path
                  d="M14 5.5V22.5M8.5 9.8V22.5M19.5 9.8V22.5"
                  stroke="#5B9240"
                  strokeWidth="1.2"
                />
                <path
                  d="M14 19.5C14 16 11.5 14 9 14C9 17 11.2 19.5 14 19.5Z"
                  fill="#6AA143"
                />
                <path
                  d="M14 19.5C14 16 16.5 14 19 14C19 17 16.8 19.5 14 19.5Z"
                  fill="#4D7E2E"
                />
              </svg>
            </div>
            <span className="text-[18px] sm:text-[19px] font-semibold tracking-tight text-[#141C17] dark:text-white whitespace-nowrap shrink-0">
              CultivAI
            </span>
          </button>

          {/* Center Search + Mic */}
          <div className="flex items-center gap-2 order-3 sm:order-2 w-full sm:w-auto justify-center">
            <div className="flex items-center gap-2 h-10 px-3.5 rounded-[16px] bg-white/78 dark:bg-[#16211A]/85 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_4px_18px_rgba(20,40,25,0.04)] flex-1 sm:w-[230px] md:w-[250px] sm:flex-none">
              <Search className="w-4 h-4 text-[#4C5851] dark:text-[#98A89E] shrink-0" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                aria-label="Search greenhouse telemetry"
                className="w-full bg-transparent text-[13px] text-[#151D18] dark:text-white placeholder:text-[#66726A] dark:placeholder:text-[#86968C] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleVoiceSearch}
              aria-label="Voice search"
              className={`w-10 h-10 rounded-[16px] backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_4px_18px_rgba(20,40,25,0.04)] flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                voiceActive
                  ? 'bg-[#A5FA48] text-[#14220B]'
                  : 'bg-white/78 dark:bg-[#16211A]/85 text-[#2C3630] dark:text-[#DCE8E0] hover:bg-white dark:hover:bg-[#1D2B22]'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          {/* Right Controls Cluster */}
          <div className="flex items-center gap-2 order-2 sm:order-3 shrink-0">
            {/* Vibrant Lime AI Assistant Button */}
            <button
              type="button"
              onClick={() => setAiDrawerOpen(true)}
              className="h-10 px-3.5 sm:px-4 rounded-[16px] bg-gradient-to-r from-[#A5FA48] via-[#8FEB34] to-[#BAFC62] text-[#15240B] text-[13px] font-semibold shadow-[0_6px_20px_rgba(143,235,52,0.38)] hover:brightness-105 active:scale-[0.99] transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 shrink-0"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M11 2l1.4 4.2L16.5 7.5l-4.1 1.3L11 13l-1.4-4.2L5.5 7.5l4.1-1.3L11 2z" />
                <path d="M18.5 13l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" />
              </svg>
              <span>AI Assistant</span>
            </button>

            {/* Insights / Export / Alerts Group */}
            <div className="h-10 px-1.5 rounded-[16px] bg-white/78 dark:bg-[#16211A]/85 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_4px_18px_rgba(20,40,25,0.04)] flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setInsightsOpen(true)}
                aria-label="Environmental insights"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#2C3630] dark:text-[#DCE8E0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Lightbulb className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                aria-label="Export CSV telemetry"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#2C3630] dark:text-[#DCE8E0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                aria-label="Threshold alerts"
                className="relative w-8 h-8 rounded-xl flex items-center justify-center text-[#2C3630] dark:text-[#DCE8E0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unackedCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C85A2D]" />
                )}
              </button>
            </div>

            {/* Dark / Light Mode Group */}
            <div className="h-10 px-1.5 rounded-[16px] bg-white/78 dark:bg-[#16211A]/85 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_4px_18px_rgba(20,40,25,0.04)] flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setDarkMode(true)}
                aria-label="Dark mode"
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  darkMode
                    ? 'bg-[#293A2F] text-white'
                    : 'text-[#4C5851] hover:bg-black/5'
                }`}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(false)}
                aria-label="Light mode"
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  !darkMode
                    ? 'bg-[#F0F4F1] text-[#151D18] shadow-2xs'
                    : 'text-[#98A89E] hover:bg-white/10'
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* MAIN WORKSPACE: LEFT FLOATING RAIL + BENTO CONTENT */}
        <div className="flex-1 flex gap-4 items-stretch min-h-0">
          {/* Desktop Left Floating Vertical Dock */}
          <aside
            aria-label="Primary navigation"
            className="hidden lg:flex flex-col justify-between w-[52px] shrink-0 pt-20 pb-0"
          >
            {/* Top Navigation Capsule */}
            <nav className="rounded-[22px] bg-white/78 dark:bg-[#16211A]/85 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_24px_rgba(20,40,25,0.045)] p-1.5 flex flex-col items-center gap-2">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-[#5F8E3E] text-white shadow-[0_4px_12px_rgba(95,142,62,0.35)]'
                        : 'text-[#39453E] dark:text-[#B5C4BA] hover:bg-[#EFF4F0] dark:hover:bg-white/10'
                    }`}
                  >
                    {item.id === 'overview' ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-[18px] h-[18px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z" />
                        <path d="M12 17c0-2.5 2-4.5 4-4.5 0 2.5-1.5 4.5-4 4.5z" />
                        <path d="M12 17c0-2-1.5-3.5-3.5-3.5 0 2 1.2 3.5 3.5 3.5z" />
                      </svg>
                    ) : (
                      <IconComp className="w-[18px] h-[18px]" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Bottom Account & Settings Capsule */}
            <div className="rounded-[22px] bg-white/78 dark:bg-[#16211A]/85 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_24px_rgba(20,40,25,0.045)] p-1.5 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                title="Settings & Account"
                aria-label="Open account settings"
                className="w-10 h-10 rounded-[14px] flex items-center justify-center text-[#39453E] dark:text-[#B5C4BA] hover:bg-[#EFF4F0] dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Settings className="w-[18px] h-[18px]" />
              </button>

              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                title={user ? `${user.name} (${user.role})` : 'Sign in'}
                aria-label="Operator profile"
                className="w-9 h-9 rounded-full overflow-hidden border border-black/10 dark:border-white/20 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B9B42]"
              >
                {!avatarImgFailed ? (
                  <img
                    src="/src/assets/images/agronomist_user_avatar_1795354702290.jpg"
                    alt={user ? user.name : 'Greenhouse Operator'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#5F8E3E] text-white text-xs font-semibold flex items-center justify-center">
                    {user ? user.name.slice(0, 2).toUpperCase() : 'CA'}
                  </div>
                )}
              </button>
            </div>
          </aside>

          {/* Main Content Viewport */}
          <main className="flex-1 min-w-0 flex flex-col">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.75fr)_minmax(290px,1fr)] gap-4 flex-1 items-stretch">
                {/* LEFT BENTO COLUMN */}
                <div className="flex flex-col gap-4 min-w-0">
                  {/* HERO GREENHOUSE PHOTO + FLOATING HARVEST AI CARD */}
                  <section className="relative rounded-[24px] overflow-hidden h-[290px] sm:h-[365px] xl:h-[420px] shadow-[0_10px_34px_rgba(18,36,24,0.08)] border border-white/80 dark:border-white/10 bg-[#D7E6DC] dark:bg-[#142119]">
                    {!heroImgFailed ? (
                      <img
                        src="/src/assets/images/greenhouse_hydroponic_hero_1795354701813.jpg"
                        alt="CultivAI automated hydroponic lettuce greenhouse interior"
                        referrerPolicy="no-referrer"
                        onError={() => setHeroImgFailed(true)}
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#9EC985] via-[#6D9D4B] to-[#3B6328]" />
                    )}

                    {/* Floating Center Harvest AI Card */}
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <HarvestAiGauge
                        score={latest ? latest.harvestScore : 0}
                        status={latest ? latest.harvestStatus : loading ? 'Loading...' : 'Awaiting Ingest'}
                        onExpand={() => setExpandedMetric('harvestScore')}
                      />
                    </div>

                    {!loading && !latest && (
                      <div className="absolute bottom-3 left-3 right-3 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setActiveTab('keys')}
                          className="px-3.5 py-1.5 rounded-xl bg-white/90 dark:bg-[#131C16]/90 backdrop-blur-md text-[12px] font-medium text-[#151D18] dark:text-white shadow-md border border-black/5 cursor-pointer"
                        >
                          No ingested telemetry yet — configure an Ingest API Key to stream sensor data
                        </button>
                      </div>
                    )}
                  </section>

                  {/* BOTTOM LEFT ROW: 2x2 KPI GRID + GROWTH RATE CARD */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1">
                    {/* 2x2 Compact KPI Cards */}
                    <div className="md:col-span-6 grid grid-cols-2 gap-3.5">
                      {matchesFilter('Indoor Climate') && (
                        <KpiCard
                          icon={<Thermometer className="w-4 h-4" />}
                          title="Indoor Climate"
                          value={latest ? String(Math.round(latest.indoorTempC * 10) / 10) : '--'}
                          unit="°C"
                          onExpand={() => setExpandedMetric('indoorTempC')}
                        />
                      )}
                      {matchesFilter('Air Moisture') && (
                        <KpiCard
                          icon={<Droplet className="w-4 h-4" />}
                          title="Air Moisture"
                          value={latest ? String(Math.round(latest.airMoisturePct)) : '--'}
                          unit="%"
                          onExpand={() => setExpandedMetric('airMoisturePct')}
                        />
                      )}
                      {matchesFilter('Light Level') && (
                        <KpiCard
                          icon={<Lightbulb className="w-4 h-4" />}
                          title="Light Level"
                          value={latest ? String(Math.round(latest.lightLevelHours)) : '--'}
                          unit="H"
                          onExpand={() => setExpandedMetric('lightLevelHours')}
                        />
                      )}
                      {matchesFilter('EC Level') && (
                        <KpiCard
                          icon={<Sprout className="w-4 h-4" />}
                          title="EC Level"
                          value={latest ? latest.ecLevelMs.toFixed(1) : '--'}
                          unit="mS"
                          onExpand={() => setExpandedMetric('ecLevelMs')}
                        />
                      )}
                    </div>

                    {/* Growth Rate Card */}
                    {matchesFilter('Growth Rate') && (
                      <section className="md:col-span-6 rounded-[24px] bg-white/84 dark:bg-[#141E18]/86 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_30px_rgba(22,42,28,0.045)] p-5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] shrink-0">
                                <TrendingUp className="w-4 h-4" />
                              </div>
                              <h2 className="text-[14px] font-medium text-[#222B25] dark:text-[#E2EDE6] truncate">
                                Growth Rate
                              </h2>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedMetric('growthRate')}
                              aria-label="Inspect Growth Rate history"
                              className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 hover:bg-[#E7ECE9] dark:hover:bg-white/20 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] transition-colors shrink-0 cursor-pointer"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="mt-2.5 text-[26px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
                            {latest ? latest.growthRate.toFixed(2) : '--'}
                          </div>
                        </div>

                        {latest ? (
                          <GrowthRateChart
                            growthRate={latest.growthRate}
                            history={history}
                          />
                        ) : (
                          <div className="mt-4 flex-1 flex items-center justify-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-[12px] text-[#5C6760] dark:text-[#98A89E] min-h-[112px]">
                            Awaiting growth telemetry
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </div>

                {/* RIGHT BENTO COLUMN: WATER FLOW + POWER CONSUMPTION + AIR CO2 */}
                <div className="flex flex-col gap-4 min-w-0">
                  {/* Water Flow Card */}
                  {matchesFilter('Water Flow') && (
                    <section className="rounded-[24px] bg-white/84 dark:bg-[#141E18]/86 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_30px_rgba(22,42,28,0.045)] p-5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] shrink-0">
                            <Droplets className="w-4 h-4" />
                          </div>
                          <h2 className="text-[14px] font-medium text-[#222B25] dark:text-[#E2EDE6] truncate">
                            Water Flow
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedMetric('waterFlowL')}
                          aria-label="Inspect Water Flow history"
                          className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 hover:bg-[#E7ECE9] dark:hover:bg-white/20 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] transition-colors shrink-0 cursor-pointer"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span className="text-[25px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
                          {latest ? latest.waterFlowL.toFixed(3) : '--'}
                        </span>
                        <span className="text-[15px] font-medium text-[#2A332D] dark:text-[#B9C9BF]">
                          L
                        </span>
                      </div>

                      {latest ? (
                        <WaterFlowChart
                          waterFlowL={latest.waterFlowL}
                          waterFlowDelta={latest.waterFlowDelta}
                          history={history}
                        />
                      ) : (
                        <div className="mt-4 flex items-center justify-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-[12px] text-[#5C6760] dark:text-[#98A89E] h-[88px]">
                          Awaiting water flow telemetry
                        </div>
                      )}
                    </section>
                  )}

                  {/* Power Consumption Card */}
                  {matchesFilter('Power Consumption') && (
                    <section className="rounded-[24px] bg-white/84 dark:bg-[#141E18]/86 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_30px_rgba(22,42,28,0.045)] p-5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] shrink-0">
                            <Zap className="w-4 h-4" />
                          </div>
                          <h2 className="text-[14px] font-medium text-[#222B25] dark:text-[#E2EDE6] truncate">
                            Power Consumption
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedMetric('powerTotalKwh')}
                          aria-label="Inspect Power Consumption history"
                          className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 hover:bg-[#E7ECE9] dark:hover:bg-white/20 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] transition-colors shrink-0 cursor-pointer"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[25px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
                            {latest ? Math.round(latest.powerTotalKwh) : '--'}
                          </span>
                          <span className="text-[12.5px] font-medium text-[#5C6760] dark:text-[#98A89E]">
                            kWh
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2.5 text-[11px] text-[#5C6760] dark:text-[#98A89E] tabular-nums">
                          <span>
                            Lighting:{' '}
                            <strong className="text-[13px] font-semibold text-[#151D18] dark:text-white">
                              {latest ? Math.round(latest.powerLightingKwh) : '--'}
                            </strong>{' '}
                            kWh
                          </span>
                          <span>
                            Other:{' '}
                            <strong className="text-[13px] font-semibold text-[#151D18] dark:text-white">
                              {latest ? Math.round(latest.powerOtherKwh) : '--'}
                            </strong>{' '}
                            kWh
                          </span>
                        </div>
                      </div>

                      {latest ? (
                        <PowerConsumptionChart
                          powerTotalKwh={latest.powerTotalKwh}
                          history={history}
                        />
                      ) : (
                        <div className="mt-4 flex items-center justify-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-[12px] text-[#5C6760] dark:text-[#98A89E] h-[88px]">
                          Awaiting power telemetry
                        </div>
                      )}
                    </section>
                  )}

                  {/* Air CO2 Card */}
                  {matchesFilter('Air CO2') && (
                    <section className="rounded-[24px] bg-white/84 dark:bg-[#141E18]/86 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_30px_rgba(22,42,28,0.045)] p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] shrink-0">
                              <Wind className="w-4 h-4" />
                            </div>
                            <h2 className="text-[14px] font-medium text-[#222B25] dark:text-[#E2EDE6] truncate">
                              Air CO<sub className="text-[10px]">2</sub>
                            </h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedMetric('airCo2Ppm')}
                            aria-label="Inspect Air CO2 history"
                            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 hover:bg-[#E7ECE9] dark:hover:bg-white/20 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] transition-colors shrink-0 cursor-pointer"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className="text-[25px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
                            {latest ? Math.round(latest.airCo2Ppm) : '--'}
                          </span>
                          <span className="text-[12.5px] font-medium text-[#5C6760] dark:text-[#98A89E]">
                            ppm
                          </span>
                        </div>
                      </div>

                      {latest ? (
                        <AirCo2Chart
                          airCo2Ppm={latest.airCo2Ppm}
                          recordedAt={latest.recordedAt}
                          history={history}
                        />
                      ) : (
                        <div className="mt-4 flex-1 flex items-center justify-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-[12px] text-[#5C6760] dark:text-[#98A89E] min-h-[118px]">
                          Awaiting CO₂ telemetry
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'water' && <WaterAnalyticsView history={history} />}

            {activeTab === 'schedule' && (
              <ScheduleView
                activeZoneId={activeZoneId}
                schedules={overview?.schedules ?? []}
                token={token}
                onRequireAuth={() => setAuthModalOpen(true)}
                onRefresh={() => fetchOverview(activeZoneId)}
              />
            )}

            {activeTab === 'controls' && (
              <ControlsView
                activeZoneId={activeZoneId}
                threshold={overview?.threshold ?? null}
                token={token}
                onRequireAuth={() => setAuthModalOpen(true)}
                onRefresh={() => fetchOverview(activeZoneId)}
              />
            )}

            {activeTab === 'logs' && <LogsAndSwaggerView history={history} />}

            {activeTab === 'keys' && (
              <ZonesAndKeysView
                activeZoneId={activeZoneId}
                zones={overview?.zones ?? []}
                token={token}
                onRequireAuth={() => setAuthModalOpen(true)}
                onRefresh={() => fetchOverview(activeZoneId)}
                onSelectZone={(id) => {
                  setActiveZoneId(id);
                  setActiveTab('overview');
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile / Tablet Compact Floating Navigation Bar (<= 15% viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-2.5 left-3 right-3 z-40 rounded-[20px] bg-white/92 dark:bg-[#141E18]/94 backdrop-blur-xl border border-white/80 dark:border-white/12 shadow-[0_10px_30px_rgba(0,0,0,0.12)] px-2 py-1.5 flex items-center justify-around"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#5F8E3E] text-white'
                  : 'text-[#39453E] dark:text-[#B5C4BA]'
              }`}
            >
              {item.id === 'overview' ? (
                <svg
                  viewBox="0 0 24 24"
                  className="w-[18px] h-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z" />
                  <path d="M12 17c0-2.5 2-4.5 4-4.5 0 2.5-1.5 4.5-4 4.5z" />
                  <path d="M12 17c0-2-1.5-3.5-3.5-3.5 0 2 1.2 3.5 3.5 3.5z" />
                </svg>
              ) : (
                <IconComp className="w-[18px] h-[18px]" />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          aria-label="Account"
          className="w-9 h-9 rounded-full overflow-hidden border border-black/10 cursor-pointer"
        >
          <img
            src="/src/assets/images/agronomist_user_avatar_1795354702290.jpg"
            alt="Operator"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </button>
      </nav>

      {/* Modals & Drawers */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        onAuthSuccess={(u, t) => {
          setUser(u);
          setToken(t);
        }}
        onLogout={() => {
          setUser(null);
          setToken(null);
        }}
      />

      <MetricDetailModal
        metric={expandedMetric}
        onClose={() => setExpandedMetric(null)}
        history={history}
      />

      <AiAssistantDrawer
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        token={token}
        activeZoneId={activeZoneId}
        onRequireAuth={() => {
          setAiDrawerOpen(false);
          setAuthModalOpen(true);
        }}
      />

      <AlertsModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        alerts={alertsList}
        token={token}
        onAcknowledge={handleAcknowledgeAlert}
        onRequireAuth={() => {
          setAlertsOpen(false);
          setAuthModalOpen(true);
        }}
      />

      <InsightsModal
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        latest={latest}
        threshold={overview?.threshold ?? null}
      />
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit: string;
  onExpand: () => void;
}

function KpiCard({ icon, title, value, unit, onExpand }: KpiCardProps) {
  return (
    <section className="rounded-[24px] bg-white/84 dark:bg-[#141E18]/86 backdrop-blur-md border border-white/85 dark:border-white/10 shadow-[0_8px_30px_rgba(22,42,28,0.045)] p-4 sm:p-5 flex flex-col justify-between min-h-[112px]">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] shrink-0">
          {icon}
        </div>
        <h2 className="text-[13px] sm:text-[13.5px] font-medium text-[#222B25] dark:text-[#E2EDE6] truncate">
          {title}
        </h2>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="text-[25px] sm:text-[27px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
            {value}
          </span>
          <span className="text-[12.5px] font-medium text-[#5C6760] dark:text-[#98A89E]">
            {unit}
          </span>
        </div>

        <button
          type="button"
          onClick={onExpand}
          aria-label={`Inspect ${title} history`}
          className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 hover:bg-[#E7ECE9] dark:hover:bg-white/20 flex items-center justify-center text-[#242E28] dark:text-[#DCE8E0] transition-colors shrink-0 cursor-pointer"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
