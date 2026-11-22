/**
 * CultivAI External IoT / PLC Telemetry Ingestion Simulator
 *
 * Strictly simulates an EXTERNAL hardware gateway pushing real HTTP POST requests
 * authenticated with X-API-Key to /api/ingest/batch and /api/ingest/telemetry.
 *
 * Usage:
 *   CULTIVAI_API_KEY="cai_live_..." npx tsx scripts/simulate-ingest.ts --seed-baseline
 *   CULTIVAI_API_KEY="cai_live_..." npx tsx scripts/simulate-ingest.ts --stream --interval=4000
 */

import 'dotenv/config';

const args = process.argv.slice(2);

function getArgValue(prefix: string): string | undefined {
  const match = args.find((a) => a.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

const API_URL = (getArgValue('--url') ?? process.env.CULTIVAI_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  ''
);
const API_KEY = getArgValue('--key') ?? process.env.CULTIVAI_API_KEY ?? '';
const ZONE_CODE = getArgValue('--zone') ?? 'ZONE-A1';
const SEED_BASELINE = args.includes('--seed-baseline');
const STREAM_MODE = args.includes('--stream') || !SEED_BASELINE;
const INTERVAL_MS = Number(getArgValue('--interval') ?? 4000);

if (!API_KEY || !API_KEY.startsWith('cai_live_')) {
  console.error(
    'Error: Provide a valid CultivAI Ingest API Key via CULTIVAI_API_KEY env var or --key=cai_live_...'
  );
  console.error(
    'Generate one inside CultivAI -> Zones & API Keys (#) after signing in.'
  );
  process.exit(1);
}

async function postIngest(endpoint: string, payload: unknown) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body.error ?? res.statusText}`);
  }
  return body;
}

async function seedBaselineHistory() {
  console.log(`[Simulator] Seeding 7-day baseline history to ${API_URL}/api/ingest/batch ...`);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  // 7 chronological points aligned with July 20 -> July 26 and 07:00 -> 16:47 curve
  const baselinePoints = [
    {
      offsetMs: -6 * dayMs,
      harvestScore: 72,
      waterFlowL: 5.42,
      waterFlowDelta: 2.81,
      powerTotalKwh: 118,
      powerLightingKwh: 90,
      powerOtherKwh: 18,
      indoorTempC: 21.8,
      airMoisturePct: 64,
      lightLevelHours: 14,
      ecLevelMs: 1.9,
      growthRate: 0.42,
      airCo2Ppm: 630,
    },
    {
      offsetMs: -5 * dayMs,
      harvestScore: 74,
      waterFlowL: 5.85,
      waterFlowDelta: 3.02,
      powerTotalKwh: 126,
      powerLightingKwh: 96,
      powerOtherKwh: 19,
      indoorTempC: 22.1,
      airMoisturePct: 65,
      lightLevelHours: 14,
      ecLevelMs: 2.0,
      growthRate: 0.54,
      airCo2Ppm: 720,
    },
    {
      offsetMs: -4 * dayMs,
      harvestScore: 78,
      waterFlowL: 6.2,
      waterFlowDelta: 3.21,
      powerTotalKwh: 138,
      powerLightingKwh: 106,
      powerOtherKwh: 20,
      indoorTempC: 22.6,
      airMoisturePct: 67,
      lightLevelHours: 15,
      ecLevelMs: 2.0,
      growthRate: 0.68,
      airCo2Ppm: 790,
    },
    {
      offsetMs: -3 * dayMs,
      harvestScore: 81,
      waterFlowL: 6.5,
      waterFlowDelta: 3.41,
      powerTotalKwh: 152,
      powerLightingKwh: 118,
      powerOtherKwh: 22,
      indoorTempC: 23.2,
      airMoisturePct: 69,
      lightLevelHours: 15,
      ecLevelMs: 2.1,
      growthRate: 0.74,
      airCo2Ppm: 870,
    },
    {
      offsetMs: -2 * dayMs,
      harvestScore: 79,
      waterFlowL: 6.4,
      waterFlowDelta: 3.35,
      powerTotalKwh: 141,
      powerLightingKwh: 109,
      powerOtherKwh: 20,
      indoorTempC: 22.8,
      airMoisturePct: 68,
      lightLevelHours: 15,
      ecLevelMs: 2.1,
      growthRate: 0.62,
      airCo2Ppm: 840,
    },
    {
      offsetMs: -1 * dayMs,
      harvestScore: 80,
      waterFlowL: 6.62,
      waterFlowDelta: 3.48,
      powerTotalKwh: 139,
      powerLightingKwh: 108,
      powerOtherKwh: 19,
      indoorTempC: 22.9,
      airMoisturePct: 67,
      lightLevelHours: 15,
      ecLevelMs: 2.1,
      growthRate: 0.66,
      airCo2Ppm: 880,
    },
    {
      offsetMs: -2 * hourMs,
      harvestScore: 79,
      waterFlowL: 6.68,
      waterFlowDelta: 3.51,
      powerTotalKwh: 142,
      powerLightingKwh: 110,
      powerOtherKwh: 20,
      indoorTempC: 23.0,
      airMoisturePct: 68,
      lightLevelHours: 15,
      ecLevelMs: 2.1,
      growthRate: 0.69,
      airCo2Ppm: 830,
    },
    {
      offsetMs: 0,
      harvestScore: 80,
      waterFlowL: 6.75,
      waterFlowDelta: 3.541,
      powerTotalKwh: 144,
      powerLightingKwh: 112,
      powerOtherKwh: 20,
      indoorTempC: 23,
      airMoisturePct: 68,
      lightLevelHours: 15,
      ecLevelMs: 2.1,
      growthRate: 0.7,
      airCo2Ppm: 900,
    },
  ];

  const readings = baselinePoints.map((pt) => ({
    zoneCode: ZONE_CODE,
    sourceDevice: 'plc-baseline-sync',
    harvestScore: pt.harvestScore,
    harvestStatus: pt.harvestScore >= 70 ? 'Good Growth' : 'Moderate Growth',
    waterFlowL: pt.waterFlowL,
    waterFlowDelta: pt.waterFlowDelta,
    powerTotalKwh: pt.powerTotalKwh,
    powerLightingKwh: pt.powerLightingKwh,
    powerOtherKwh: pt.powerOtherKwh,
    indoorTempC: pt.indoorTempC,
    airMoisturePct: pt.airMoisturePct,
    lightLevelHours: pt.lightLevelHours,
    ecLevelMs: pt.ecLevelMs,
    growthRate: pt.growthRate,
    airCo2Ppm: pt.airCo2Ppm,
    recordedAt: new Date(now + pt.offsetMs).toISOString(),
  }));

  const result = await postIngest('/api/ingest/batch', { readings });
  console.log(`[Simulator] Baseline batch ingested (${result.count} readings).`);
}

function clamp(n: number, min: number, max: number, decimals = 1): number {
  const v = Math.min(max, Math.max(min, n));
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

async function runLiveStream() {
  console.log(
    `[Simulator] Streaming live external sensor frames every ${INTERVAL_MS}ms to ${API_URL}/api/ingest/telemetry (Zone ${ZONE_CODE})`
  );

  let state = {
    harvestScore: 80,
    waterFlowL: 6.75,
    powerTotalKwh: 144,
    powerLightingKwh: 112,
    powerOtherKwh: 20,
    indoorTempC: 23.0,
    airMoisturePct: 68,
    lightLevelHours: 15,
    ecLevelMs: 2.1,
    growthRate: 0.7,
    airCo2Ppm: 900,
  };

  const emitFrame = async () => {
    state = {
      harvestScore: clamp(state.harvestScore + (Math.random() - 0.48) * 1.2, 74, 92, 0),
      waterFlowL: clamp(state.waterFlowL + (Math.random() - 0.5) * 0.16, 5.8, 7.6, 3),
      powerTotalKwh: clamp(state.powerTotalKwh + (Math.random() - 0.5) * 4, 128, 165, 0),
      powerLightingKwh: clamp(state.powerLightingKwh + (Math.random() - 0.5) * 3, 98, 126, 0),
      powerOtherKwh: clamp(state.powerOtherKwh + (Math.random() - 0.5) * 2, 16, 28, 0),
      indoorTempC: clamp(state.indoorTempC + (Math.random() - 0.5) * 0.4, 21.0, 25.5, 1),
      airMoisturePct: clamp(state.airMoisturePct + (Math.random() - 0.5) * 1.5, 60, 76, 0),
      lightLevelHours: 15,
      ecLevelMs: clamp(state.ecLevelMs + (Math.random() - 0.5) * 0.08, 1.8, 2.5, 1),
      growthRate: clamp(state.growthRate + (Math.random() - 0.5) * 0.03, 0.58, 0.84, 2),
      airCo2Ppm: clamp(state.airCo2Ppm + (Math.random() - 0.5) * 22, 760, 960, 0),
    };

    const payload = {
      zoneCode: ZONE_CODE,
      sourceDevice: 'external-plc-simulator',
      ...state,
      waterFlowDelta: clamp(state.waterFlowL * 0.5246, 2.5, 4.5, 3),
    };

    try {
      const res = await postIngest('/api/ingest/telemetry', payload);
      console.log(
        `[Simulator] -> ID #${res.reading?.id} | Temp ${state.indoorTempC}°C | CO2 ${state.airCo2Ppm}ppm | Harvest ${state.harvestScore}%`
      );
    } catch (err) {
      console.error('[Simulator] Ingest error:', err instanceof Error ? err.message : err);
    }
  };

  await emitFrame();
  setInterval(emitFrame, INTERVAL_MS);
}

async function main() {
  if (SEED_BASELINE) {
    await seedBaselineHistory();
  }
  if (STREAM_MODE && !SEED_BASELINE) {
    await runLiveStream();
  } else if (args.includes('--stream')) {
    await runLiveStream();
  }
}

main().catch((err) => {
  console.error('[Simulator] Fatal:', err);
  process.exit(1);
});
