import { useState, useEffect, type FormEvent } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  Trash2,
  Plus,
  ExternalLink,
  Sliders,
  Droplets,
  Calendar,
  Terminal,
} from 'lucide-react';
import type {
  ApiKeyInfo,
  GreenhouseZone,
  TelemetryReading,
  ZoneSchedule,
  ZoneThreshold,
} from '../types/telemetry';

interface SharedSecondaryProps {
  activeZoneId: number;
  zones: GreenhouseZone[];
  history: TelemetryReading[];
  threshold: ZoneThreshold | null;
  schedules: ZoneSchedule[];
  token: string | null;
  onRequireAuth: () => void;
  onRefresh: () => Promise<void>;
}

export function WaterAnalyticsView({ history }: Pick<SharedSecondaryProps, 'history'>) {
  const recent = [...history].reverse().slice(0, 20);
  return (
    <div className="rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#EFF5EC] dark:bg-emerald-950/60 flex items-center justify-center text-[#5D8E3E]">
          <Droplets className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-[#151D18] dark:text-white">
            Irrigation &amp; Nutrient Flow Ledger
          </h2>
          <p className="text-[12.5px] text-[#5C6760] dark:text-[#98A89E]">
            Live Water Flow (L), Flow Delta, and Hydroponic EC (mS) ingested from external sensors
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-black/5 dark:border-white/10 rounded-2xl">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead className="bg-[#F4F8F5] dark:bg-white/5 text-[#55615A] dark:text-[#A4B5AA] text-[12px]">
            <tr>
              <th className="py-3 px-4 font-medium">Recorded At</th>
              <th className="py-3 px-4 font-medium">Source Device</th>
              <th className="py-3 px-4 font-medium text-right">Water Flow (L)</th>
              <th className="py-3 px-4 font-medium text-right">Sum Delta</th>
              <th className="py-3 px-4 font-medium text-right">EC Level (mS)</th>
              <th className="py-3 px-4 font-medium text-right">Air Moisture</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {recent.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[#5C6760]">
                  No irrigation telemetry ingested yet.
                </td>
              </tr>
            ) : (
              recent.map((r) => (
                <tr key={r.id} className="hover:bg-[#F8FBF9] dark:hover:bg-white/5">
                  <td className="py-2.5 px-4 tabular-nums">{new Date(r.recordedAt).toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-mono text-[11.5px]">{r.sourceDevice}</td>
                  <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                    {r.waterFlowL.toFixed(3)} L
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{r.waterFlowDelta.toFixed(3)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{r.ecLevelMs.toFixed(1)} mS</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{r.airMoisturePct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleView({
  activeZoneId,
  schedules,
  token,
  onRequireAuth,
  onRefresh,
}: Pick<SharedSecondaryProps, 'activeZoneId' | 'schedules' | 'token' | 'onRequireAuth' | 'onRefresh'>) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'irrigation' | 'lighting' | 'nutrient' | 'harvest'>(
    'irrigation'
  );
  const [startTime, setStartTime] = useState('08:00');
  const [durationMin, setDurationMin] = useState(30);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function addSchedule(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          zoneId: activeZoneId,
          title,
          category,
          startTime,
          durationMin: Number(durationMin),
        }),
      });
      if (res.status === 401) {
        onRequireAuth();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error ?? 'Failed to save schedule.');
      } else {
        setTitle('');
        await onRefresh();
      }
    } catch {
      setErrorMsg('Network error saving schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSchedule(item: ZoneSchedule) {
    if (!token) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const res = await fetch(`/api/schedules/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error ?? 'Failed to update schedule.');
      return;
    }
    await onRefresh();
  }

  async function deleteSchedule(id: number) {
    if (!token) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error ?? 'Failed to delete schedule.');
      return;
    }
    await onRefresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-[#EFF5EC] dark:bg-emerald-950/60 flex items-center justify-center text-[#5D8E3E]">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-[#151D18] dark:text-white">
              Cultivation Automation Schedule
            </h2>
            <p className="text-[12.5px] text-[#5C6760] dark:text-[#98A89E]">
              Persisted zone cycles for irrigation, LED lighting, and nutrient dosing
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-black/5 dark:border-white/10 bg-[#F6FAF7] dark:bg-white/5 p-3.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#151D18] dark:text-white truncate">
                  {s.title}
                </p>
                <p className="text-[12px] text-[#5C6760] dark:text-[#98A89E] tabular-nums">
                  {s.category} · Starts {s.startTime} · {s.durationMin} min
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleSchedule(s)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors cursor-pointer ${
                    s.enabled
                      ? 'bg-[#6B9B42] text-white'
                      : 'bg-[#E5EAE7] dark:bg-white/10 text-[#49544D] dark:text-white/70'
                  }`}
                >
                  {s.enabled ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSchedule(s.id)}
                  aria-label="Delete schedule"
                  className="w-8 h-8 rounded-xl bg-white dark:bg-white/10 border border-black/5 flex items-center justify-center text-[#5C6760] hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-5 rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm">
        <h3 className="text-[16px] font-semibold text-[#151D18] dark:text-white mb-4">
          Add Automation Cycle
        </h3>
        {errorMsg && (
          <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
        <form onSubmit={addSchedule} className="space-y-3.5">
          <div>
            <label className="block text-[12px] font-medium text-[#4C5851] dark:text-[#A9B8AF] mb-1">
              Cycle Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evening Mist Cycle"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#4C5851] dark:text-[#A9B8AF] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as 'irrigation' | 'lighting' | 'nutrient' | 'harvest')
                }
                className="w-full px-3 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px]"
              >
                <option value="irrigation">Irrigation</option>
                <option value="lighting">Lighting</option>
                <option value="nutrient">Nutrient</option>
                <option value="harvest">Harvest</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#4C5851] dark:text-[#A9B8AF] mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px] tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#4C5851] dark:text-[#A9B8AF] mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px] tabular-nums"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[13px] font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {token ? 'Save Schedule' : 'Sign In to Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ControlsView({
  activeZoneId,
  threshold,
  token,
  onRequireAuth,
  onRefresh,
}: Pick<SharedSecondaryProps, 'activeZoneId' | 'threshold' | 'token' | 'onRequireAuth' | 'onRefresh'>) {
  const [targetTempC, setTargetTempC] = useState(threshold?.targetTempC ?? 23);
  const [targetMoisturePct, setTargetMoisturePct] = useState(threshold?.targetMoisturePct ?? 68);
  const [targetCo2Ppm, setTargetCo2Ppm] = useState(threshold?.targetCo2Ppm ?? 900);
  const [targetEcMs, setTargetEcMs] = useState(threshold?.targetEcMs ?? 2.1);
  const [lightPhotoperiodH, setLightPhotoperiodH] = useState(threshold?.lightPhotoperiodH ?? 15);
  const [autoIrrigation, setAutoIrrigation] = useState(threshold?.autoIrrigation ?? true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!threshold) return;
    setTargetTempC(threshold.targetTempC);
    setTargetMoisturePct(threshold.targetMoisturePct);
    setTargetCo2Ppm(threshold.targetCo2Ppm);
    setTargetEcMs(threshold.targetEcMs);
    setLightPhotoperiodH(threshold.lightPhotoperiodH);
    setAutoIrrigation(threshold.autoIrrigation);
  }, [threshold]);

  async function saveControls(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/thresholds/${activeZoneId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetTempC,
          targetMoisturePct,
          targetCo2Ppm,
          targetEcMs,
          lightPhotoperiodH,
          autoIrrigation,
        }),
      });
      if (res.status === 401) {
        onRequireAuth();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error ?? 'Failed to save setpoints.');
      } else {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2500);
        await onRefresh();
      }
    } catch {
      setErrorMsg('Network error saving setpoints.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-[#EFF5EC] dark:bg-emerald-950/60 flex items-center justify-center text-[#5D8E3E]">
          <Sliders className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-[#151D18] dark:text-white">
            Environmental Setpoints &amp; Thresholds
          </h2>
          <p className="text-[12.5px] text-[#5C6760] dark:text-[#98A89E]">
            Incoming external telemetry is evaluated against these PostgreSQL setpoints
          </p>
        </div>
      </div>

      <form onSubmit={saveControls} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#F5F8F6] dark:bg-white/5 border border-black/5 dark:border-white/10">
            <div className="flex justify-between text-[13px] font-medium mb-2">
              <span>Target Indoor Climate</span>
              <span className="tabular-nums font-semibold">{targetTempC.toFixed(1)} °C</span>
            </div>
            <input
              type="range"
              min={15}
              max={32}
              step={0.5}
              value={targetTempC}
              onChange={(e) => setTargetTempC(Number(e.target.value))}
              className="w-full accent-[#6B9B42]"
            />
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F8F6] dark:bg-white/5 border border-black/5 dark:border-white/10">
            <div className="flex justify-between text-[13px] font-medium mb-2">
              <span>Target Air Moisture</span>
              <span className="tabular-nums font-semibold">{targetMoisturePct}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={90}
              step={1}
              value={targetMoisturePct}
              onChange={(e) => setTargetMoisturePct(Number(e.target.value))}
              className="w-full accent-[#6B9B42]"
            />
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F8F6] dark:bg-white/5 border border-black/5 dark:border-white/10">
            <div className="flex justify-between text-[13px] font-medium mb-2">
              <span>Target Air CO2</span>
              <span className="tabular-nums font-semibold">{targetCo2Ppm} ppm</span>
            </div>
            <input
              type="range"
              min={400}
              max={1500}
              step={25}
              value={targetCo2Ppm}
              onChange={(e) => setTargetCo2Ppm(Number(e.target.value))}
              className="w-full accent-[#6B9B42]"
            />
          </div>

          <div className="p-4 rounded-2xl bg-[#F5F8F6] dark:bg-white/5 border border-black/5 dark:border-white/10">
            <div className="flex justify-between text-[13px] font-medium mb-2">
              <span>Target EC Level</span>
              <span className="tabular-nums font-semibold">{targetEcMs.toFixed(1)} mS</span>
            </div>
            <input
              type="range"
              min={1.0}
              max={3.5}
              step={0.1}
              value={targetEcMs}
              onChange={(e) => setTargetEcMs(Number(e.target.value))}
              className="w-full accent-[#6B9B42]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <label className="flex items-center gap-2.5 text-[13.5px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={autoIrrigation}
              onChange={(e) => setAutoIrrigation(e.target.checked)}
              className="w-4 h-4 accent-[#6B9B42] rounded"
            />
            Automatic NFT Drip Irrigation Active
          </label>

          <div className="flex items-center gap-3">
            {errorMsg && (
              <span className="text-[12.5px] font-medium text-red-600 dark:text-red-400">
                {errorMsg}
              </span>
            )}
            {savedNotice && (
              <span className="text-[12.5px] font-medium text-[#5A8B35]">
                Setpoints saved to PostgreSQL
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[13px] font-semibold cursor-pointer"
            >
              {token ? (saving ? 'Saving...' : 'Apply Setpoints') : 'Sign In to Update'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function LogsAndSwaggerView({ history }: Pick<SharedSecondaryProps, 'history'>) {
  const [subTab, setSubTab] = useState<'logs' | 'swagger'>('swagger');
  const recent = [...history].reverse().slice(0, 25);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#F2F6F3] dark:bg-white/5">
          <button
            type="button"
            onClick={() => setSubTab('swagger')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
              subTab === 'swagger'
                ? 'bg-white dark:bg-[#1F2C24] text-[#151D18] dark:text-white shadow-xs'
                : 'text-[#5C6760] dark:text-[#98A89E]'
            }`}
          >
            Swagger API Docs
          </button>
          <button
            type="button"
            onClick={() => setSubTab('logs')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
              subTab === 'logs'
                ? 'bg-white dark:bg-[#1F2C24] text-[#151D18] dark:text-white shadow-xs'
                : 'text-[#5C6760] dark:text-[#98A89E]'
            }`}
          >
            PostgreSQL Ingest Stream ({recent.length})
          </button>
        </div>

        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[12.5px] font-medium inline-flex items-center gap-2"
        >
          Open Full Swagger UI
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {subTab === 'swagger' ? (
        <div className="rounded-[24px] overflow-hidden bg-white border border-black/10 shadow-sm h-[640px]">
          <iframe
            src="/api/docs"
            title="CultivAI Swagger API Documentation"
            className="w-full h-full border-0"
          />
        </div>
      ) : (
        <div className="rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-5 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-[12.5px] border-collapse">
            <thead className="bg-[#F4F8F5] dark:bg-white/5 text-[#55615A] dark:text-[#A4B5AA]">
              <tr>
                <th className="py-2.5 px-3 font-medium">ID</th>
                <th className="py-2.5 px-3 font-medium">Time</th>
                <th className="py-2.5 px-3 font-medium">Device</th>
                <th className="py-2.5 px-3 font-medium text-right">Temp</th>
                <th className="py-2.5 px-3 font-medium text-right">Moisture</th>
                <th className="py-2.5 px-3 font-medium text-right">CO2</th>
                <th className="py-2.5 px-3 font-medium text-right">Water</th>
                <th className="py-2.5 px-3 font-medium text-right">Power</th>
                <th className="py-2.5 px-3 font-medium text-right">Harvest AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-3 tabular-nums">#{r.id}</td>
                  <td className="py-2 px-3 tabular-nums">
                    {new Date(r.recordedAt).toLocaleTimeString()}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px]">{r.sourceDevice}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.indoorTempC} °C</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.airMoisturePct}%</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Math.round(r.airCo2Ppm)} ppm</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.waterFlowL.toFixed(2)} L</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.powerTotalKwh} kWh</td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                    {Math.round(r.harvestScore)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ZonesAndKeysView({
  activeZoneId,
  zones,
  token,
  onRequireAuth,
  onRefresh,
  onSelectZone,
}: Pick<SharedSecondaryProps, 'activeZoneId' | 'zones' | 'token' | 'onRequireAuth' | 'onRefresh'> & {
  onSelectZone: (zoneId: number) => void;
}) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [keyName, setKeyName] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<number>(zones[0]?.id ?? activeZoneId);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [cropType, setCropType] = useState('Butterhead Lettuce');

  async function loadKeys() {
    if (!token) return;
    const res = await fetch('/api/keys', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
    }
  }

  useEffect(() => {
    loadKeys();
  }, [token]);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: keyName, zoneId: selectedZoneId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to generate API key.');
      return;
    }
    setNewRawKey(data.rawKey);
    setKeyName('');
    await loadKeys();
  }

  async function createZone(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setErrorMsg(null);
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code: zoneCode, name: zoneName, cropType }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to create zone.');
      return;
    }
    setZoneCode('');
    setZoneName('');
    await onRefresh();
  }

  async function revokeKey(id: number) {
    if (!token) return;
    setErrorMsg(null);
    const res = await fetch(`/api/keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      onRequireAuth();
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrorMsg(d.error ?? 'Failed to revoke API key.');
      return;
    }
    await loadKeys();
  }

  function copyValue(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left: Ingest API Keys */}
      <div className="lg:col-span-7 rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EFF5EC] dark:bg-emerald-950/60 flex items-center justify-center text-[#5D8E3E]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#151D18] dark:text-white">
                External Ingest API Keys
              </h2>
              <p className="text-[12.5px] text-[#5C6760] dark:text-[#98A89E]">
                Dedicated X-API-Key credentials for PLCs &amp; simulator scripts (separate from user login)
              </p>
            </div>
          </div>
        </div>

        {!token ? (
          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-white/5 p-6 text-center space-y-3">
            <p className="text-[13.5px] text-[#3B4740] dark:text-[#C5D4CA]">
              Sign in with your operator account to create and manage external ingestion API keys.
            </p>
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-5 py-2.5 rounded-xl bg-[#6B9B42] text-white text-[13px] font-semibold cursor-pointer"
            >
              Sign In / Setup Admin
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={createKey} className="flex flex-wrap gap-2.5">
              <input
                type="text"
                required
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Key label (e.g. Bay A1 PLC)"
                className="flex-1 min-w-[180px] px-3.5 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px]"
              />
              <select
                value={selectedZoneId}
                onChange={(e) => setSelectedZoneId(Number(e.target.value))}
                className="px-3 py-2.5 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[13px]"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code} — {z.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Generate Key
              </button>
            </form>

            {newRawKey && (
              <div className="rounded-2xl bg-[#ECF6E5] dark:bg-emerald-950/50 border border-[#6B9B42]/40 p-4 space-y-2">
                <p className="text-[12.5px] font-semibold text-[#2E5419] dark:text-emerald-200">
                  Copy your new Ingest API Key now — it will never be shown again:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[12px] bg-white/80 dark:bg-black/30 px-3 py-2 rounded-lg break-all">
                    {newRawKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyValue(newRawKey)}
                    className="px-3 py-2 rounded-lg bg-[#6B9B42] text-white text-[12px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {keys.length === 0 ? (
                <p className="text-[13px] text-[#5C6760] py-4 text-center">
                  No API keys created yet. Generate one above to authenticate your simulator or PLC.
                </p>
              ) : (
                keys.map((k) => (
                  <div
                    key={k.id}
                    className="rounded-2xl border border-black/5 dark:border-white/10 bg-[#F7FAF8] dark:bg-white/5 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold text-[#151D18] dark:text-white">
                        {k.name}
                      </p>
                      <p className="text-[11.5px] font-mono text-[#5C6760] dark:text-[#98A89E]">
                        {k.keyPrefix}•••••••• · {k.isActive ? 'Active' : 'Revoked'}
                        {k.lastUsedAt
                          ? ` · Last used ${new Date(k.lastUsedAt).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                    {k.isActive && (
                      <button
                        type="button"
                        onClick={() => revokeKey(k.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[12px] font-medium cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: External Simulator Integration Guide */}
      <div className="lg:col-span-5 rounded-[24px] bg-white/85 dark:bg-[#141E18]/85 backdrop-blur-md border border-white/80 dark:border-white/10 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-[#5D8E3E]" />
          <h3 className="text-[16px] font-semibold text-[#151D18] dark:text-white">
            External System &amp; Simulator CLI
          </h3>
        </div>
        <p className="text-[12.5px] text-[#5C6760] dark:text-[#98A89E] leading-relaxed">
          CultivAI never generates fake sensor values inside the browser or server loop. Run the
          external simulator script or point your IoT gateway at{' '}
          <code className="font-mono text-[11.5px]">POST /api/ingest/telemetry</code>:
        </p>

        <div className="rounded-2xl bg-[#151D18] text-[#DCE8DF] p-4 font-mono text-[11.5px] leading-relaxed overflow-x-auto">
          <div># 1. Seed 7-day baseline history via Ingest API</div>
          <div className="text-[#9EE855] mb-3">
            CULTIVAI_API_KEY=&quot;cai_live_...&quot; npx tsx scripts/simulate-ingest.ts --seed-baseline
          </div>
          <div># 2. Stream live telemetry every 3s (Socket.IO sync)</div>
          <div className="text-[#9EE855]">
            CULTIVAI_API_KEY=&quot;cai_live_...&quot; npx tsx scripts/simulate-ingest.ts --stream
          </div>
        </div>

        <div className="pt-2 space-y-3">
          <h4 className="text-[13px] font-semibold text-[#151D18] dark:text-white">
            Greenhouse Zones (Click to Monitor)
          </h4>
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[12px] text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
          <div className="space-y-2">
            {zones.map((z) => {
              const isCurrent = z.id === activeZoneId;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => onSelectZone(z.id)}
                  className={`w-full text-left rounded-xl px-3.5 py-2.5 flex items-center justify-between text-[12.5px] transition-colors cursor-pointer border ${
                    isCurrent
                      ? 'bg-[#EAF4E5] dark:bg-emerald-950/50 border-[#6B9B42]/50'
                      : 'bg-[#F5F8F6] dark:bg-white/5 border-transparent hover:border-black/10 dark:hover:border-white/15'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-[#151D18] dark:text-white">{z.name}</span>
                    <span className="text-[#5C6760] dark:text-[#98A89E] ml-2">· {z.cropType}</span>
                  </div>
                  <span className="font-mono text-[11.5px] text-[#5D8E3E]">
                    {z.code} {isCurrent ? '· Active' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {token && (
            <form onSubmit={createZone} className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={zoneCode}
                onChange={(e) => setZoneCode(e.target.value)}
                placeholder="ZONE-C3"
                className="px-3 py-2 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[12px] font-mono uppercase"
              />
              <input
                type="text"
                required
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="East Microgreens"
                className="px-3 py-2 rounded-xl bg-[#F4F8F5] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[12px]"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-[#6B9B42] hover:bg-[#5B8835] text-white text-[12px] font-semibold cursor-pointer"
              >
                + Add Zone
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
