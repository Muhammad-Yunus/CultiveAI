import { useState, useEffect, type FormEvent } from 'react';
import {
  X,
  Sparkles,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  User as UserIcon,
  Lock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  AlertItem,
  MetricKey,
  TelemetryReading,
  UserProfile,
  ZoneThreshold,
} from '../types/telemetry';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

export function AuthModal({
  open,
  onClose,
  user,
  onAuthSuccess,
  onLogout,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || user) return;
    fetch('/api/auth/bootstrap-status')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.hasUsers === 'boolean') {
          setHasUsers(d.hasUsers);
          if (!d.hasUsers) setMode('register');
        }
      })
      .catch(() => {});
  }, [open, user]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body =
        mode === 'register' ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Authentication failed.');
      } else {
        onAuthSuccess(data.user, data.token);
        setPassword('');
        onClose();
      }
    } catch {
      setError('Unable to reach authentication server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[24px] bg-white/95 dark:bg-[#131C16]/95 border border-white/80 dark:border-white/12 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#EEF5EB] dark:bg-emerald-950/60 flex items-center justify-center text-[#5A8B35] dark:text-emerald-300">
              {user ? <UserIcon className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[#151D18] dark:text-white">
                {user
                  ? 'Operator Account'
                  : hasUsers === false
                  ? 'Create Primary Admin Account'
                  : 'CultivAI Operator Sign In'}
              </h2>
              <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E]">
                {user
                  ? 'Session held securely in memory'
                  : 'User-based access for controls, API keys & AI assistant'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 flex items-center justify-center text-[#3A453F] dark:text-white/80 hover:bg-[#E6EAE8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#F4F8F5] dark:bg-white/5 border border-black/5 dark:border-white/10 p-4 flex items-center gap-3.5">
              <img
                src="/src/assets/images/agronomist_user_avatar_1795354702290.jpg"
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border border-black/10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[#151D18] dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E] truncate">
                  {user.email}
                </p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#528131] dark:text-emerald-300">
                {user.role}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[#161E19] dark:bg-white/10 text-white text-[13px] font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1 p-1 rounded-xl bg-[#F1F5F2] dark:bg-white/5 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#1E2A22] text-[#151D18] dark:text-white shadow-xs'
                    : 'text-[#5C6760] dark:text-[#98A89E]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#1E2A22] text-[#151D18] dark:text-white shadow-xs'
                    : 'text-[#5C6760] dark:text-[#98A89E]'
                }`}
              >
                {hasUsers === false ? 'Setup Admin' : 'Register'}
              </button>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-[12.5px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-[12px] font-medium text-[#434F48] dark:text-[#B5C4BA] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Yunus Pratama"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F8F6] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13.5px] text-[#151D18] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6B9B42]"
                  />
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-[#434F48] dark:text-[#B5C4BA] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@cultivai.io"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F8F6] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13.5px] text-[#151D18] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6B9B42]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#434F48] dark:text-[#B5C4BA] mb-1">
                  Password (min. 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F8F6] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13.5px] text-[#151D18] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6B9B42]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[13.5px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading
                  ? 'Processing...'
                  : mode === 'register'
                  ? hasUsers === false
                    ? 'Claim Admin & Continue'
                    : 'Create Account'
                  : 'Sign In'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

interface MetricDetailModalProps {
  metric: MetricKey | null;
  onClose: () => void;
  history: TelemetryReading[];
}

const METRIC_META: Record<
  MetricKey,
  { label: string; unit: string; format: (r: TelemetryReading) => string }
> = {
  harvestScore: { label: 'Harvest AI Score', unit: '%', format: (r) => `${r.harvestScore}%` },
  waterFlowL: { label: 'Water Flow', unit: 'L', format: (r) => `${r.waterFlowL.toFixed(3)} L` },
  powerTotalKwh: {
    label: 'Power Consumption',
    unit: 'kWh',
    format: (r) => `${r.powerTotalKwh} kWh`,
  },
  indoorTempC: { label: 'Indoor Climate', unit: '°C', format: (r) => `${r.indoorTempC} °C` },
  airMoisturePct: { label: 'Air Moisture', unit: '%', format: (r) => `${r.airMoisturePct} %` },
  lightLevelHours: { label: 'Light Level', unit: 'H', format: (r) => `${r.lightLevelHours} H` },
  ecLevelMs: { label: 'EC Level', unit: 'mS', format: (r) => `${r.ecLevelMs.toFixed(1)} mS` },
  growthRate: { label: 'Growth Rate', unit: 'idx', format: (r) => r.growthRate.toFixed(2) },
  airCo2Ppm: { label: 'Air CO2', unit: 'ppm', format: (r) => `${Math.round(r.airCo2Ppm)} ppm` },
};

export function MetricDetailModal({ metric, onClose, history }: MetricDetailModalProps) {
  if (!metric) return null;
  const meta = METRIC_META[metric];
  const rows = [...history].reverse().slice(0, 16);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[24px] bg-white/95 dark:bg-[#131C16]/95 border border-white/80 dark:border-white/12 shadow-2xl p-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-semibold text-[#151D18] dark:text-white">
              {meta.label} History
            </h2>
            <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E]">
              Live PostgreSQL telemetry records ({rows.length} recent readings)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail modal"
            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 border border-black/5 dark:border-white/10 rounded-2xl">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#5C6760] dark:text-[#98A89E]">
              No readings ingested yet. Push telemetry via POST /api/ingest/telemetry.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[13px]">
              <thead className="bg-[#F4F8F5] dark:bg-white/5 text-[#55615A] dark:text-[#A4B5AA] text-[11.5px]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Source Device</th>
                  <th className="py-2.5 px-4 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8FBF9] dark:hover:bg-white/5">
                    <td className="py-2.5 px-4 tabular-nums text-[#3C4740] dark:text-[#C8D6CD]">
                      {new Date(r.recordedAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px] text-[#5C6760] dark:text-[#98A89E]">
                      {r.sourceDevice}
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold tabular-nums text-[#151D18] dark:text-white">
                      {meta.format(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  activeZoneId: number;
  onRequireAuth: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
}

export function AiAssistantDrawer({
  open,
  onClose,
  token,
  activeZoneId,
  onRequireAuth,
}: AiAssistantDrawerProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Halo! Saya CultivAI Greenhouse Expert (RAG). Tanyakan analisis kondisi iklim & VPD saat ini, evaluasi EC/CO₂, anomali alert, atau prediksi hasil panen berdasarkan data PostgreSQL CultivAI.',
    },
  ]);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function submitPrompt(questionText: string) {
    if (!token) {
      onRequireAuth();
      return;
    }
    const q = questionText.trim();
    if (!q || loading) return;

    const priorHistory = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setPrompt('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: q, zoneId: activeZoneId, history: priorHistory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.error ?? 'Unable to generate AI insight.' },
        ]);
      } else {
        const stats = data.ragStats;
        const metaParts = [
          data.modelUsed ? `${data.modelUsed}` : null,
          stats?.readingsRetrieved !== undefined
            ? `${stats.readingsRetrieved} DB readings`
            : null,
          stats?.vpdKpa !== null && stats?.vpdKpa !== undefined
            ? `VPD ${stats.vpdKpa} kPa`
            : null,
        ].filter(Boolean);

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            meta: metaParts.length > 0 ? metaParts.join(' · ') : undefined,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Network error reaching CultivAI Assistant API.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function sendQuestion(e: FormEvent) {
    e.preventDefault();
    submitPrompt(prompt);
  }

  const starterPrompts = [
    'Analisis kondisi VPD, CO₂, dan EC saat ini berdasarkan data terbaru',
    'Prediksi tren pertumbuhan & estimasi kesiapan panen zona aktif',
    'Evaluasi efisiensi konsumsi listrik & aliran air beserta rekomendasinya',
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-white/95 dark:bg-[#111914]/98 border-l border-black/10 dark:border-white/10 shadow-2xl p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#A5FA48] to-[#74D626] flex items-center justify-center text-[#14220B]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#151D18] dark:text-white">
                CultivAI Assistant
              </h2>
              <p className="text-[11.5px] text-[#5C6760] dark:text-[#98A89E]">
                PostgreSQL RAG · Greenhouse Expert &amp; Forecaster
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Assistant"
            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'ml-8 bg-[#6B9B42] text-white whitespace-pre-wrap'
                  : 'mr-2 bg-[#F2F6F3] dark:bg-white/5 text-[#1A231E] dark:text-[#E7EFEA]'
              }`}
            >
              {m.role === 'user' ? (
                <div>{m.text}</div>
              ) : (
                <div className="space-y-2 break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
                    components={{
                      h1: ({ children }) => (
                        <h3 className="text-[14.5px] font-semibold text-[#141C17] dark:text-white mt-2 first:mt-0">
                          {children}
                        </h3>
                      ),
                      h2: ({ children }) => (
                        <h4 className="text-[13.5px] font-semibold text-[#141C17] dark:text-white mt-2 first:mt-0">
                          {children}
                        </h4>
                      ),
                      h3: ({ children }) => (
                        <h5 className="text-[13px] font-semibold text-[#2E5419] dark:text-emerald-300 mt-1.5 first:mt-0">
                          {children}
                        </h5>
                      ),
                      p: ({ children }) => (
                        <p className="text-[13px] leading-relaxed my-1 first:mt-0 last:mb-0">
                          {children}
                        </p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-[#141C17] dark:text-white">
                          {children}
                        </strong>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc pl-4 space-y-1 my-1.5">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal pl-4 space-y-1 my-1.5">{children}</ol>
                      ),
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      code: ({ children, className }) => {
                        const isBlock = Boolean(className);
                        return isBlock ? (
                          <code className="block font-mono text-[11.5px] bg-[#151D18] text-[#DCE8DF] p-3 rounded-xl overflow-x-auto my-2">
                            {children}
                          </code>
                        ) : (
                          <code className="font-mono text-[11.5px] px-1.5 py-0.5 rounded-md bg-black/6 dark:bg-white/10 text-[#2E5419] dark:text-emerald-300">
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => <div className="my-1">{children}</div>,
                      blockquote: ({ children }) => (
                        <blockquote className="pl-3 border-l-2 border-[#6B9B42] text-[#45534A] dark:text-[#B5C6BC] my-1.5">
                          {children}
                        </blockquote>
                      ),
                      hr: () => <hr className="border-black/10 dark:border-white/10 my-2.5" />,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2 rounded-xl border border-black/8 dark:border-white/10">
                          <table className="w-full text-left text-[12px] border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-black/4 dark:bg-white/5 font-semibold">
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => (
                        <th className="py-1.5 px-2.5 border-b border-black/8 dark:border-white/10">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="py-1.5 px-2.5 border-b border-black/5 dark:border-white/5 tabular-nums">
                          {children}
                        </td>
                      ),
                      a: ({ href, children }) =>
                        href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4F7D2D] dark:text-emerald-300 underline underline-offset-2"
                          >
                            {children}
                          </a>
                        ) : (
                          <span>{children}</span>
                        ),
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                </div>
              )}
              {m.meta && (
                <div className="mt-2.5 pt-1.5 border-t border-black/5 dark:border-white/10 text-[11px] text-[#5C6760] dark:text-[#98A89E] tabular-nums">
                  {m.meta}
                </div>
              )}
            </div>
          ))}

          {messages.length === 1 && token && (
            <div className="space-y-2 pt-1">
              {starterPrompts.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => submitPrompt(sp)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl border border-black/8 dark:border-white/10 bg-white/70 dark:bg-white/5 hover:bg-[#EDF5EA] dark:hover:bg-white/10 text-[12px] text-[#26322B] dark:text-[#D1DFD6] transition-colors cursor-pointer"
                >
                  {sp}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="mr-4 rounded-2xl px-4 py-3 bg-[#F2F6F3] dark:bg-white/5 text-[12.5px] text-[#5C6760] dark:text-[#98A89E]">
              Retrieving PostgreSQL telemetry &amp; computing forecast...
            </div>
          )}
        </div>

        {!token ? (
          <button
            type="button"
            onClick={onRequireAuth}
            className="w-full py-2.5 px-4 rounded-xl bg-[#6B9B42] text-white text-[13px] font-semibold cursor-pointer"
          >
            Sign in to ask CultivAI Assistant
          </button>
        ) : (
          <form onSubmit={sendQuestion} className="pt-3 border-t border-black/5 dark:border-white/10 flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Tanya analisis, prediksi, atau rekomendasi greenhouse..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px] text-[#151D18] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6B9B42]"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Send message"
              className="px-4 py-2.5 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white flex items-center justify-center disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface AlertsModalProps {
  open: boolean;
  onClose: () => void;
  alerts: AlertItem[];
  token: string | null;
  onAcknowledge: (id: number) => Promise<void>;
  onRequireAuth: () => void;
}

export function AlertsModal({
  open,
  onClose,
  alerts,
  token,
  onAcknowledge,
  onRequireAuth,
}: AlertsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[24px] bg-white/95 dark:bg-[#131C16]/95 border border-white/80 dark:border-white/12 shadow-2xl p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[17px] font-semibold text-[#151D18] dark:text-white">
              Threshold Alerts
            </h2>
            <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E]">
              Triggered automatically on telemetry ingestion
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close alerts"
            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-2.5 flex-1">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#5C6760] dark:text-[#98A89E]">
              <ShieldCheck className="w-7 h-7 mx-auto mb-2 text-[#6B9B42]" />
              All environmental parameters are within target range.
            </div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-black/5 dark:border-white/10 p-3.5 bg-[#F7FAF8] dark:bg-white/5 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                    }`}
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-[#151D18] dark:text-white">
                      {a.metric} · {a.severity.toUpperCase()}
                    </p>
                    <p className="text-[12.5px] text-[#4C5851] dark:text-[#B4C4BA] mt-0.5">
                      {a.message}
                    </p>
                    <p className="text-[11px] text-[#7A877F] mt-1 tabular-nums">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {a.acknowledged ? (
                  <span className="text-[11px] font-medium text-[#5C6760] flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#6B9B42]" />
                    Acked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => (token ? onAcknowledge(a.id) : onRequireAuth())}
                    className="px-2.5 py-1 rounded-lg bg-[#6B9B42] text-white text-[11.5px] font-medium shrink-0 cursor-pointer"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface InsightsModalProps {
  open: boolean;
  onClose: () => void;
  latest: TelemetryReading | null;
  threshold: ZoneThreshold | null;
}

export function InsightsModal({ open, onClose, latest, threshold }: InsightsModalProps) {
  if (!open) return null;

  const items = latest
    ? [
        {
          label: 'Thermal Balance',
          current: `${latest.indoorTempC} °C`,
          target: `${threshold?.targetTempC ?? 23} °C`,
          note:
            Math.abs(latest.indoorTempC - (threshold?.targetTempC ?? 23)) < 1.5
              ? 'Optimal leafy-green canopy temperature.'
              : 'Adjust HVAC venting toward target setpoint.',
        },
        {
          label: 'CO2 Assimilation',
          current: `${Math.round(latest.airCo2Ppm)} ppm`,
          target: `${threshold?.targetCo2Ppm ?? 900} ppm`,
          note:
            latest.airCo2Ppm >= 800
              ? 'Strong photosynthetic enrichment rate.'
              : 'Consider supplementing CO2 injection during photoperiod.',
        },
        {
          label: 'Nutrient Conductivity (EC)',
          current: `${latest.ecLevelMs.toFixed(1)} mS`,
          target: `${threshold?.targetEcMs ?? 2.1} mS`,
          note: 'Balanced hydroponic macro-nutrient concentration.',
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[24px] bg-white/95 dark:bg-[#131C16]/95 border border-white/80 dark:border-white/12 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-semibold text-[#151D18] dark:text-white">
            Environmental Insights
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close insights"
            className="w-8 h-8 rounded-full bg-[#F3F5F4] dark:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-[13px] text-[#5C6760] dark:text-[#98A89E]">
            Ingest sensor readings to compute zone insights.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-[#F5F8F6] dark:bg-white/5 p-3.5 border border-black/5 dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#151D18] dark:text-white">
                    {item.label}
                  </span>
                  <span className="text-[12.5px] font-semibold tabular-nums text-[#5B8B36] dark:text-emerald-300">
                    {item.current} / {item.target}
                  </span>
                </div>
                <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E] mt-1">{item.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
