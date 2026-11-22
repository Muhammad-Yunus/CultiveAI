import { desc, eq, asc } from 'drizzle-orm';
import { db } from '../db';
import {
  greenhouseZones,
  telemetryReadings,
  zoneThresholds,
  zoneSchedules,
  alerts,
  type TelemetryReadingRow,
} from '../db/schema';

export interface RagSummaryStats {
  readingsRetrieved: number;
  alertsRetrieved: number;
  schedulesRetrieved: number;
  vpdKpa: number | null;
  latestReadingId: number | null;
  trendHarvestSlope: number | null;
  trendGrowthSlope: number | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

function computeStats(values: number[]) {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, slope: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  // Simple linear regression slope over index order
  let slope = 0;
  if (values.length >= 2) {
    const n = values.length;
    const meanX = (n - 1) / 2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (values[i] - avg);
      den += (i - meanX) * (i - meanX);
    }
    slope = den > 0 ? num / den : 0;
  }

  return { min, max, avg, slope };
}

/**
 * Magnus-Tetens Vapor Pressure Deficit (VPD) in kPa
 * Optimal leafy-green hydroponic VPD is typically 0.80 - 1.20 kPa.
 */
function calculateVpdKpa(tempC: number, rhPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const ea = es * (Math.max(0, Math.min(100, rhPct)) / 100);
  return Number(Math.max(0, es - ea).toFixed(3));
}

function buildCompletionsEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

export async function retrieveGreenhouseRagContext(
  question: string,
  requestedZoneId?: number
): Promise<{ contextText: string; stats: RagSummaryStats }> {
  if (!db) {
    throw new Error('Database not configured.');
  }

  const allZones = await db.select().from(greenhouseZones).orderBy(asc(greenhouseZones.id));
  const targetZone =
    allZones.find((z) => z.id === requestedZoneId) ?? allZones[0] ?? null;

  if (!targetZone) {
    return {
      contextText: 'No greenhouse zones or telemetry records exist in PostgreSQL yet.',
      stats: {
        readingsRetrieved: 0,
        alertsRetrieved: 0,
        schedulesRetrieved: 0,
        vpdKpa: null,
        latestReadingId: null,
        trendHarvestSlope: null,
        trendGrowthSlope: null,
      },
    };
  }

  const recentRows = await db
    .select()
    .from(telemetryReadings)
    .where(eq(telemetryReadings.zoneId, targetZone.id))
    .orderBy(desc(telemetryReadings.recordedAt), desc(telemetryReadings.id))
    .limit(60);

  const chronological = [...recentRows].reverse();
  const latest: TelemetryReadingRow | null = recentRows[0] ?? null;

  const [threshold] = await db
    .select()
    .from(zoneThresholds)
    .where(eq(zoneThresholds.zoneId, targetZone.id))
    .limit(1);

  const recentAlerts = await db
    .select()
    .from(alerts)
    .where(eq(alerts.zoneId, targetZone.id))
    .orderBy(desc(alerts.createdAt))
    .limit(15);

  const schedules = await db
    .select()
    .from(zoneSchedules)
    .where(eq(zoneSchedules.zoneId, targetZone.id))
    .orderBy(asc(zoneSchedules.startTime));

  // Statistical aggregates & trend slopes across retrieved window
  const tempStats = computeStats(chronological.map((r) => r.indoorTempC));
  const rhStats = computeStats(chronological.map((r) => r.airMoisturePct));
  const co2Stats = computeStats(chronological.map((r) => r.airCo2Ppm));
  const ecStats = computeStats(chronological.map((r) => r.ecLevelMs));
  const waterStats = computeStats(chronological.map((r) => r.waterFlowL));
  const powerStats = computeStats(chronological.map((r) => r.powerTotalKwh));
  const growthStats = computeStats(chronological.map((r) => r.growthRate));
  const harvestStats = computeStats(chronological.map((r) => r.harvestScore));

  const vpdKpa = latest ? calculateVpdKpa(latest.indoorTempC, latest.airMoisturePct) : null;

  // Query-aware focused slices for RAG precision
  const qLower = question.toLowerCase();
  const includeAllZonesSummary =
    allZones.length > 1 &&
    /(zone|zona|semua|all|compare|banding|bay)/i.test(qLower);

  let crossZoneBlock = '';
  if (includeAllZonesSummary) {
    const otherSnapshots: string[] = [];
    for (const z of allZones) {
      const [zLatest] = await db
        .select()
        .from(telemetryReadings)
        .where(eq(telemetryReadings.zoneId, z.id))
        .orderBy(desc(telemetryReadings.recordedAt), desc(telemetryReadings.id))
        .limit(1);
      otherSnapshots.push(
        zLatest
          ? `- ${z.code} (${z.name}, ${z.cropType}): Temp ${zLatest.indoorTempC}°C, RH ${zLatest.airMoisturePct}%, CO2 ${zLatest.airCo2Ppm}ppm, EC ${zLatest.ecLevelMs}mS, Harvest ${zLatest.harvestScore}%`
          : `- ${z.code} (${z.name}, ${z.cropType}): No telemetry ingested yet.`
      );
    }
    crossZoneBlock = `\n### All Greenhouse Zones Snapshot\n${otherSnapshots.join('\n')}`;
  }

  const latest12Lines = chronological
    .slice(-12)
    .map(
      (r) =>
        `  - [#${r.id} @ ${new Date(r.recordedAt).toISOString()} | dev=${r.sourceDevice}] Harvest=${r.harvestScore}% (${r.harvestStatus}), Temp=${r.indoorTempC}°C, RH=${r.airMoisturePct}%, VPD=${calculateVpdKpa(r.indoorTempC, r.airMoisturePct)}kPa, CO2=${r.airCo2Ppm}ppm, EC=${r.ecLevelMs}mS, Light=${r.lightLevelHours}H, Water=${r.waterFlowL}L (delta ${r.waterFlowDelta}), Power=${r.powerTotalKwh}kWh (Light=${r.powerLightingKwh}, Other=${r.powerOtherKwh}), GrowthRate=${r.growthRate}`
    )
    .join('\n');

  const alertLines =
    recentAlerts.length > 0
      ? recentAlerts
          .map(
            (a) =>
              `  - [${a.severity.toUpperCase()} | ${a.acknowledged ? 'ACKED' : 'OPEN'} @ ${new Date(a.createdAt).toISOString()}] ${a.metric}: ${a.message}`
          )
          .join('\n')
      : '  - No alerts recorded.';

  const scheduleLines =
    schedules.length > 0
      ? schedules
          .map(
            (s) =>
              `  - [${s.enabled ? 'ACTIVE' : 'PAUSED'}] ${s.title} (${s.category}) @ ${s.startTime} for ${s.durationMin} min`
          )
          .join('\n')
      : '  - No schedules configured.';

  const contextText = `### Active Greenhouse Zone Profile
- Zone ID: ${targetZone.id} | Code: ${targetZone.code} | Name: ${targetZone.name}
- Crop Cultivar: ${targetZone.cropType} | Zone Status: ${targetZone.status}
- Target Setpoints: Temp=${threshold?.targetTempC ?? 23}°C, RH=${threshold?.targetMoisturePct ?? 68}%, CO2=${threshold?.targetCo2Ppm ?? 900}ppm, EC=${threshold?.targetEcMs ?? 2.1}mS, Photoperiod=${threshold?.lightPhotoperiodH ?? 15}H, Auto-Irrigation=${threshold?.autoIrrigation ?? true}

### Latest Sensor Reading & Derived Agronomic Indices
${
  latest
    ? `- Timestamp: ${new Date(latest.recordedAt).toISOString()} (Reading ID #${latest.id}, Device: ${latest.sourceDevice})
- Harvest AI Score: ${latest.harvestScore}% (${latest.harvestStatus})
- Vapor Pressure Deficit (VPD): ${vpdKpa} kPa (Ideal leafy-green band: 0.80 - 1.20 kPa)
- Indoor Climate: ${latest.indoorTempC} °C | Air Moisture: ${latest.airMoisturePct}%
- Air CO2: ${latest.airCo2Ppm} ppm | Light Level: ${latest.lightLevelHours} H
- Hydroponic EC: ${latest.ecLevelMs} mS | Water Flow: ${latest.waterFlowL} L (Sum Delta: ${latest.waterFlowDelta})
- Power Consumption: ${latest.powerTotalKwh} kWh (Lighting: ${latest.powerLightingKwh} kWh, Other: ${latest.powerOtherKwh} kWh)
- Growth Rate Index: ${latest.growthRate}`
    : '- No sensor readings ingested yet for this zone.'
}

### Statistical Summary & Trend Slopes (Last ${chronological.length} PostgreSQL Readings)
- Harvest Score: avg=${harvestStats.avg.toFixed(1)}%, min=${harvestStats.min.toFixed(1)}%, max=${harvestStats.max.toFixed(1)}%, slope=${harvestStats.slope >= 0 ? '+' : ''}${harvestStats.slope.toFixed(3)}/reading
- Growth Rate: avg=${growthStats.avg.toFixed(2)}, min=${growthStats.min.toFixed(2)}, max=${growthStats.max.toFixed(2)}, slope=${growthStats.slope >= 0 ? '+' : ''}${growthStats.slope.toFixed(4)}/reading
- Indoor Temp: avg=${tempStats.avg.toFixed(1)}°C, min=${tempStats.min.toFixed(1)}°C, max=${tempStats.max.toFixed(1)}°C, slope=${tempStats.slope >= 0 ? '+' : ''}${tempStats.slope.toFixed(3)}°C/reading
- Air Moisture: avg=${rhStats.avg.toFixed(1)}%, min=${rhStats.min.toFixed(1)}%, max=${rhStats.max.toFixed(1)}%
- Air CO2: avg=${co2Stats.avg.toFixed(0)}ppm, min=${co2Stats.min.toFixed(0)}ppm, max=${co2Stats.max.toFixed(0)}ppm, slope=${co2Stats.slope >= 0 ? '+' : ''}${co2Stats.slope.toFixed(2)}ppm/reading
- EC Level: avg=${ecStats.avg.toFixed(2)}mS, min=${ecStats.min.toFixed(2)}mS, max=${ecStats.max.toFixed(2)}mS
- Water Flow: avg=${waterStats.avg.toFixed(2)}L, min=${waterStats.min.toFixed(2)}L, max=${waterStats.max.toFixed(2)}L
- Power Load: avg=${powerStats.avg.toFixed(1)}kWh, min=${powerStats.min.toFixed(1)}kWh, max=${powerStats.max.toFixed(1)}kWh

### Chronological Telemetry Window (Latest 12 Readings)
${latest12Lines || '  - None'}

### Threshold Alerts (${recentAlerts.length} Recent)
${alertLines}

### Automation Schedules (${schedules.length} Configured)
${scheduleLines}${crossZoneBlock}`;

  return {
    contextText,
    stats: {
      readingsRetrieved: chronological.length,
      alertsRetrieved: recentAlerts.length,
      schedulesRetrieved: schedules.length,
      vpdKpa,
      latestReadingId: latest?.id ?? null,
      trendHarvestSlope: chronological.length >= 2 ? Number(harvestStats.slope.toFixed(3)) : null,
      trendGrowthSlope: chronological.length >= 2 ? Number(growthStats.slope.toFixed(4)) : null,
    },
  };
}

export async function runGreenhouseRagAssistant(params: {
  prompt: string;
  zoneId?: number;
  history?: ChatTurn[];
}) {
  const aiKey = process.env.AI_KEY?.trim();
  const aiBaseUrl = process.env.AI_BASE_URL?.trim();
  const aiModel = process.env.AI_MODEL?.trim();

  if (!aiKey || !aiBaseUrl || !aiModel) {
    const missing = [
      !aiKey ? 'AI_KEY' : null,
      !aiBaseUrl ? 'AI_BASE_URL' : null,
      !aiModel ? 'AI_MODEL' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const err = new Error(
      `OpenAI-compatible AI configuration incomplete. Missing: ${missing}. Please configure them in Settings > Secrets.`
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(aiBaseUrl);
    if (!['http:', 'https:'].includes(parsedBase.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    const err = new Error('AI_BASE_URL must be a valid http:// or https:// URL.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 500;
    throw err;
  }

  const { contextText, stats } = await retrieveGreenhouseRagContext(params.prompt, params.zoneId);

  const systemPrompt = `You are CultivAI Agronomist, a world-class Controlled-Environment Agriculture (CEA) & Hydroponic Greenhouse Expert.

Your capabilities & rules:
1. **Strict Grounding (RAG)**: Answer strictly using the live PostgreSQL telemetry, statistical trend slopes, Vapor Pressure Deficit (VPD), threshold targets, alerts, and automation schedules provided in [CULTIVAI_RAG_CONTEXT]. Cite exact numbers, reading IDs, and timestamps when explaining conditions. If data is missing, state clearly what has not been ingested yet.
2. **Diagnostic Analysis**: Evaluate interactions between Temperature, Relative Humidity, VPD (optimal 0.80-1.20 kPa for leafy greens), CO2 assimilation, EC nutrient concentration, DLI/photoperiod, water flow, and lighting power load.
3. **Forecasting & Prediction**: When asked for predictions or harvest outlook, extrapolate quantitatively using the retrieved trend slopes, current Harvest AI score, Growth Rate index, and setpoint deviations—clearly stating assumptions and confidence bounds.
4. **Actionable Recommendations**: Provide specific, prioritized adjustments (exact setpoint changes, irrigation/dosing checks, energy optimization) tailored to the crop cultivar.
5. **Language Match**: Always reply in the same language as the user's question (e.g. Indonesian if the user writes in Indonesian, English if in English). Keep formatting clean and scannable.`;

  const sanitizedHistory = (params.history ?? [])
    .slice(-6)
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string' &&
        m.text.trim().length > 0
    )
    .map((m) => ({
      role: m.role,
      content: m.text.slice(0, 1500),
    }));

  const endpoint = buildCompletionsEndpoint(parsedBase.toString());

  const apiResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiKey}`,
    },
    body: JSON.stringify({
      model: aiModel,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        ...sanitizedHistory,
        {
          role: 'user',
          content: `[CULTIVAI_RAG_CONTEXT]\n${contextText}\n[/CULTIVAI_RAG_CONTEXT]\n\nUser Question: ${params.prompt}`,
        },
      ],
    }),
  });

  const payload = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    const upstreamMsg =
      payload?.error?.message ?? payload?.message ?? `Upstream status ${apiResponse.status}`;
    const err = new Error(`AI provider error: ${upstreamMsg}`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 502;
    throw err;
  }

  const answer =
    payload?.choices?.[0]?.message?.content?.trim() ??
    'No response content returned by the configured AI model.';

  return {
    answer,
    modelUsed: payload?.model ?? aiModel,
    groundedOnReadingId: stats.latestReadingId,
    ragStats: stats,
  };
}
