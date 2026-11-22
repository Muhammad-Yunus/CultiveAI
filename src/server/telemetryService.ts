import { desc, eq, asc, and } from 'drizzle-orm';
import { db } from '../db';
import {
  greenhouseZones,
  telemetryReadings,
  zoneThresholds,
  zoneSchedules,
  alerts,
  type TelemetryReadingRow,
} from '../db/schema';

export interface TelemetryIngestInput {
  zoneCode?: string;
  sourceDevice?: string;
  harvestScore: number;
  harvestStatus?: string;
  waterFlowL: number;
  waterFlowDelta?: number;
  powerTotalKwh: number;
  powerLightingKwh?: number;
  powerOtherKwh?: number;
  indoorTempC: number;
  airMoisturePct: number;
  lightLevelHours: number;
  ecLevelMs: number;
  growthRate: number;
  airCo2Ppm: number;
  recordedAt?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function deriveHarvestStatus(score: number): string {
  if (score >= 85) return 'Optimal Growth';
  if (score >= 70) return 'Good Growth';
  if (score >= 50) return 'Moderate Growth';
  return 'Needs Attention';
}

export function validateTelemetryInput(raw: unknown): {
  valid: boolean;
  data?: TelemetryIngestInput;
  error?: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'Payload must be a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;

  const requiredChecks: Array<[string, number, number]> = [
    ['harvestScore', 0, 100],
    ['waterFlowL', 0, 100000],
    ['powerTotalKwh', 0, 100000],
    ['indoorTempC', -20, 80],
    ['airMoisturePct', 0, 100],
    ['lightLevelHours', 0, 24],
    ['ecLevelMs', 0, 20],
    ['growthRate', 0, 10],
    ['airCo2Ppm', 0, 10000],
  ];

  for (const [field, min, max] of requiredChecks) {
    const val = obj[field];
    if (!isFiniteNumber(val) || val < min || val > max) {
      return {
        valid: false,
        error: `Field '${field}' must be a finite number between ${min} and ${max}.`,
      };
    }
  }

  let recordedAt: string | undefined;
  if (obj.recordedAt !== undefined) {
    if (typeof obj.recordedAt !== 'string' || Number.isNaN(Date.parse(obj.recordedAt))) {
      return { valid: false, error: "Field 'recordedAt' must be a valid ISO-8601 date string." };
    }
    recordedAt = obj.recordedAt;
  }

  const harvestScore = obj.harvestScore as number;
  const powerTotalKwh = obj.powerTotalKwh as number;
  const powerLightingKwh = isFiniteNumber(obj.powerLightingKwh)
    ? obj.powerLightingKwh
    : Math.round(powerTotalKwh * 0.78);
  const powerOtherKwh = isFiniteNumber(obj.powerOtherKwh)
    ? obj.powerOtherKwh
    : Math.max(0, Math.round(powerTotalKwh - powerLightingKwh));

  const waterFlowL = obj.waterFlowL as number;
  const waterFlowDelta = isFiniteNumber(obj.waterFlowDelta)
    ? obj.waterFlowDelta
    : Number((waterFlowL * 0.5246).toFixed(3));

  const harvestStatus =
    typeof obj.harvestStatus === 'string' && obj.harvestStatus.trim().length > 0
      ? obj.harvestStatus.trim().slice(0, 60)
      : deriveHarvestStatus(harvestScore);

  return {
    valid: true,
    data: {
      zoneCode:
        typeof obj.zoneCode === 'string' && obj.zoneCode.trim().length > 0
          ? obj.zoneCode.trim().toUpperCase().slice(0, 32)
          : undefined,
      sourceDevice:
        typeof obj.sourceDevice === 'string' && obj.sourceDevice.trim().length > 0
          ? obj.sourceDevice.trim().slice(0, 64)
          : 'external-plc',
      harvestScore,
      harvestStatus,
      waterFlowL,
      waterFlowDelta,
      powerTotalKwh,
      powerLightingKwh,
      powerOtherKwh,
      indoorTempC: obj.indoorTempC as number,
      airMoisturePct: obj.airMoisturePct as number,
      lightLevelHours: obj.lightLevelHours as number,
      ecLevelMs: obj.ecLevelMs as number,
      growthRate: obj.growthRate as number,
      airCo2Ppm: obj.airCo2Ppm as number,
      recordedAt,
    },
  };
}

export async function ensureBaseInfrastructure() {
  if (!db) return null;

  const existingZones = await db.select().from(greenhouseZones).orderBy(asc(greenhouseZones.id));
  if (existingZones.length > 0) {
    return existingZones;
  }

  const insertedZones = await db
    .insert(greenhouseZones)
    .values([
      {
        code: 'ZONE-A1',
        name: 'North Hydroponic Bay',
        cropType: 'Butterhead Lettuce',
        status: 'nominal',
      },
      {
        code: 'ZONE-B2',
        name: 'South Leafy Greens',
        cropType: 'Genovese Basil',
        status: 'nominal',
      },
    ])
    .returning();

  for (const zone of insertedZones) {
    await db
      .insert(zoneThresholds)
      .values({
        zoneId: zone.id,
        targetTempC: 23,
        targetMoisturePct: 68,
        targetCo2Ppm: 900,
        targetEcMs: 2.1,
        lightPhotoperiodH: 15,
        autoIrrigation: true,
      })
      .onConflictDoNothing();
  }

  const primaryZone = insertedZones[0];
  if (primaryZone) {
    await db.insert(zoneSchedules).values([
      {
        zoneId: primaryZone.id,
        title: 'Morning NFT Nutrient Circulation',
        category: 'irrigation',
        startTime: '06:30',
        durationMin: 45,
        enabled: true,
      },
      {
        zoneId: primaryZone.id,
        title: 'Full-Spectrum LED Canopy Cycle',
        category: 'lighting',
        startTime: '07:00',
        durationMin: 900,
        enabled: true,
      },
      {
        zoneId: primaryZone.id,
        title: 'Midday EC & pH Dosing Check',
        category: 'nutrient',
        startTime: '12:00',
        durationMin: 20,
        enabled: true,
      },
      {
        zoneId: primaryZone.id,
        title: 'Batch 14 Canopy Harvest Inspection',
        category: 'harvest',
        startTime: '16:30',
        durationMin: 30,
        enabled: true,
      },
    ]);
  }

  return insertedZones;
}

async function resolveZoneId(zoneCode?: string, fallbackZoneId?: number | null): Promise<number> {
  if (!db) throw new Error('Database not initialized');
  await ensureBaseInfrastructure();

  if (zoneCode) {
    const [found] = await db
      .select()
      .from(greenhouseZones)
      .where(eq(greenhouseZones.code, zoneCode))
      .limit(1);
    if (found) return found.id;
  }

  if (fallbackZoneId) {
    const [found] = await db
      .select()
      .from(greenhouseZones)
      .where(eq(greenhouseZones.id, fallbackZoneId))
      .limit(1);
    if (found) return found.id;
  }

  const [first] = await db.select().from(greenhouseZones).orderBy(asc(greenhouseZones.id)).limit(1);
  return first.id;
}

export async function ingestSingleTelemetry(
  input: TelemetryIngestInput,
  keyZoneId: number | null
) {
  if (!db) throw new Error('Database not initialized');
  const zoneId = await resolveZoneId(input.zoneCode, keyZoneId);

  const [inserted] = await db
    .insert(telemetryReadings)
    .values({
      zoneId,
      sourceDevice: input.sourceDevice ?? 'external-plc',
      harvestScore: input.harvestScore,
      harvestStatus: input.harvestStatus ?? deriveHarvestStatus(input.harvestScore),
      waterFlowL: input.waterFlowL,
      waterFlowDelta: input.waterFlowDelta ?? Number((input.waterFlowL * 0.5246).toFixed(3)),
      powerTotalKwh: input.powerTotalKwh,
      powerLightingKwh: input.powerLightingKwh ?? Math.round(input.powerTotalKwh * 0.78),
      powerOtherKwh: input.powerOtherKwh ?? Math.round(input.powerTotalKwh * 0.14),
      indoorTempC: input.indoorTempC,
      airMoisturePct: input.airMoisturePct,
      lightLevelHours: input.lightLevelHours,
      ecLevelMs: input.ecLevelMs,
      growthRate: input.growthRate,
      airCo2Ppm: input.airCo2Ppm,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
    })
    .returning();

  const createdAlerts = await evaluateThresholds(zoneId, inserted);
  return { reading: inserted, alerts: createdAlerts };
}

export async function ingestBatchTelemetry(
  inputs: TelemetryIngestInput[],
  keyZoneId: number | null
) {
  if (!db) throw new Error('Database not initialized');

  const rowsToInsert = [];
  for (const input of inputs) {
    const zoneId = await resolveZoneId(input.zoneCode, keyZoneId);
    rowsToInsert.push({
      zoneId,
      sourceDevice: input.sourceDevice ?? 'external-plc',
      harvestScore: input.harvestScore,
      harvestStatus: input.harvestStatus ?? deriveHarvestStatus(input.harvestScore),
      waterFlowL: input.waterFlowL,
      waterFlowDelta: input.waterFlowDelta ?? Number((input.waterFlowL * 0.5246).toFixed(3)),
      powerTotalKwh: input.powerTotalKwh,
      powerLightingKwh: input.powerLightingKwh ?? Math.round(input.powerTotalKwh * 0.78),
      powerOtherKwh: input.powerOtherKwh ?? Math.round(input.powerTotalKwh * 0.14),
      indoorTempC: input.indoorTempC,
      airMoisturePct: input.airMoisturePct,
      lightLevelHours: input.lightLevelHours,
      ecLevelMs: input.ecLevelMs,
      growthRate: input.growthRate,
      airCo2Ppm: input.airCo2Ppm,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
    });
  }

  const inserted = await db.insert(telemetryReadings).values(rowsToInsert).returning();
  const latest = inserted[inserted.length - 1];
  const createdAlerts = latest ? await evaluateThresholds(latest.zoneId, latest) : [];
  return { count: inserted.length, latest, alerts: createdAlerts };
}

async function evaluateThresholds(zoneId: number, reading: TelemetryReadingRow) {
  if (!db) return [];
  const [threshold] = await db
    .select()
    .from(zoneThresholds)
    .where(eq(zoneThresholds.zoneId, zoneId))
    .limit(1);

  if (!threshold) return [];

  const pendingAlerts: Array<{
    zoneId: number;
    metric: string;
    severity: string;
    message: string;
  }> = [];

  if (Math.abs(reading.indoorTempC - threshold.targetTempC) >= 4) {
    pendingAlerts.push({
      zoneId,
      metric: 'Indoor Climate',
      severity: 'warning',
      message: `Temperature drifted to ${reading.indoorTempC.toFixed(1)} °C (target ${threshold.targetTempC} °C)`,
    });
  }
  if (Math.abs(reading.airMoisturePct - threshold.targetMoisturePct) >= 12) {
    pendingAlerts.push({
      zoneId,
      metric: 'Air Moisture',
      severity: 'warning',
      message: `Humidity at ${reading.airMoisturePct.toFixed(0)}% (target ${threshold.targetMoisturePct}%)`,
    });
  }
  if (reading.airCo2Ppm < 450 || reading.airCo2Ppm > 1400) {
    pendingAlerts.push({
      zoneId,
      metric: 'Air CO2',
      severity: 'critical',
      message: `CO2 concentration out of nominal band at ${Math.round(reading.airCo2Ppm)} ppm`,
    });
  }
  if (Math.abs(reading.ecLevelMs - threshold.targetEcMs) >= 0.7) {
    pendingAlerts.push({
      zoneId,
      metric: 'EC Level',
      severity: 'warning',
      message: `Nutrient EC shifted to ${reading.ecLevelMs.toFixed(1)} mS (target ${threshold.targetEcMs} mS)`,
    });
  }

  if (pendingAlerts.length === 0) return [];
  return db.insert(alerts).values(pendingAlerts).returning();
}

export async function getDashboardOverview(requestedZoneId?: number) {
  if (!db) return null;
  const zones = await ensureBaseInfrastructure();
  const activeZoneId =
    requestedZoneId && zones?.some((z) => z.id === requestedZoneId)
      ? requestedZoneId
      : zones?.[0]?.id ?? 1;

  const recentReadings = await db
    .select()
    .from(telemetryReadings)
    .where(eq(telemetryReadings.zoneId, activeZoneId))
    .orderBy(desc(telemetryReadings.recordedAt), desc(telemetryReadings.id))
    .limit(48);

  const chronological = [...recentReadings].reverse();
  const latest = recentReadings[0] ?? null;

  const [threshold] = await db
    .select()
    .from(zoneThresholds)
    .where(eq(zoneThresholds.zoneId, activeZoneId))
    .limit(1);

  const recentAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.zoneId, activeZoneId)))
    .orderBy(desc(alerts.createdAt))
    .limit(20);

  const schedules = await db
    .select()
    .from(zoneSchedules)
    .where(eq(zoneSchedules.zoneId, activeZoneId))
    .orderBy(asc(zoneSchedules.startTime));

  return {
    zones: zones ?? [],
    activeZoneId,
    latest,
    history: chronological,
    threshold: threshold ?? null,
    alerts: recentAlerts,
    schedules,
  };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  // Guard CSV formula injection (=, +, -, @, tab, CR)
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export async function exportTelemetryCsv(zoneId?: number, limit = 200): Promise<string> {
  if (!db) return '';
  const rows = zoneId
    ? await db
        .select()
        .from(telemetryReadings)
        .where(eq(telemetryReadings.zoneId, zoneId))
        .orderBy(desc(telemetryReadings.recordedAt))
        .limit(limit)
    : await db
        .select()
        .from(telemetryReadings)
        .orderBy(desc(telemetryReadings.recordedAt))
        .limit(limit);

  const headers = [
    'id',
    'zoneId',
    'sourceDevice',
    'harvestScore',
    'harvestStatus',
    'waterFlowL',
    'waterFlowDelta',
    'powerTotalKwh',
    'powerLightingKwh',
    'powerOtherKwh',
    'indoorTempC',
    'airMoisturePct',
    'lightLevelHours',
    'ecLevelMs',
    'growthRate',
    'airCo2Ppm',
    'recordedAt',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.zoneId,
        r.sourceDevice,
        r.harvestScore,
        r.harvestStatus,
        r.waterFlowL,
        r.waterFlowDelta,
        r.powerTotalKwh,
        r.powerLightingKwh,
        r.powerOtherKwh,
        r.indoorTempC,
        r.airMoisturePct,
        r.lightLevelHours,
        r.ecLevelMs,
        r.growthRate,
        r.airCo2Ppm,
        r.recordedAt instanceof Date ? r.recordedAt.toISOString() : r.recordedAt,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}
