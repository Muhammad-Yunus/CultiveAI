export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface GreenhouseZone {
  id: number;
  code: string;
  name: string;
  cropType: string;
  status: string;
  createdAt: string;
}

export interface TelemetryReading {
  id: number;
  zoneId: number;
  sourceDevice: string;
  harvestScore: number;
  harvestStatus: string;
  waterFlowL: number;
  waterFlowDelta: number;
  powerTotalKwh: number;
  powerLightingKwh: number;
  powerOtherKwh: number;
  indoorTempC: number;
  airMoisturePct: number;
  lightLevelHours: number;
  ecLevelMs: number;
  growthRate: number;
  airCo2Ppm: number;
  recordedAt: string;
}

export interface ZoneThreshold {
  id: number;
  zoneId: number;
  targetTempC: number;
  targetMoisturePct: number;
  targetCo2Ppm: number;
  targetEcMs: number;
  lightPhotoperiodH: number;
  autoIrrigation: boolean;
  updatedAt: string;
}

export interface ZoneSchedule {
  id: number;
  zoneId: number;
  title: string;
  category: 'irrigation' | 'lighting' | 'nutrient' | 'harvest';
  startTime: string;
  durationMin: number;
  enabled: boolean;
  createdAt: string;
}

export interface AlertItem {
  id: number;
  zoneId: number;
  metric: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: number;
  name: string;
  keyPrefix: string;
  zoneId: number | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface DashboardOverview {
  zones: GreenhouseZone[];
  activeZoneId: number;
  latest: TelemetryReading | null;
  history: TelemetryReading[];
  threshold: ZoneThreshold | null;
  alerts: AlertItem[];
  schedules: ZoneSchedule[];
}

export type NavTab = 'overview' | 'water' | 'schedule' | 'controls' | 'logs' | 'keys';

export type MetricKey =
  | 'harvestScore'
  | 'waterFlowL'
  | 'powerTotalKwh'
  | 'indoorTempC'
  | 'airMoisturePct'
  | 'lightLevelHours'
  | 'ecLevelMs'
  | 'growthRate'
  | 'airCo2Ppm';
