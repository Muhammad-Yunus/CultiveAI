import {
  pgTable,
  serial,
  text,
  real,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('operator'), // 'admin' | 'operator'
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const greenhouseZones = pgTable('greenhouse_zones', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  cropType: text('crop_type').notNull().default('Butterhead Lettuce'),
  status: text('status').notNull().default('nominal'), // 'nominal' | 'warning' | 'offline'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    zoneId: integer('zone_id').references(() => greenhouseZones.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_api_keys_hash').on(table.keyHash)]
);

export const telemetryReadings = pgTable(
  'telemetry_readings',
  {
    id: serial('id').primaryKey(),
    zoneId: integer('zone_id')
      .references(() => greenhouseZones.id, { onDelete: 'cascade' })
      .notNull(),
    sourceDevice: text('source_device').notNull().default('external-plc'),
    harvestScore: real('harvest_score').notNull(),
    harvestStatus: text('harvest_status').notNull(),
    waterFlowL: real('water_flow_l').notNull(),
    waterFlowDelta: real('water_flow_delta').notNull(),
    powerTotalKwh: real('power_total_kwh').notNull(),
    powerLightingKwh: real('power_lighting_kwh').notNull(),
    powerOtherKwh: real('power_other_kwh').notNull(),
    indoorTempC: real('indoor_temp_c').notNull(),
    airMoisturePct: real('air_moisture_pct').notNull(),
    lightLevelHours: real('light_level_hours').notNull(),
    ecLevelMs: real('ec_level_ms').notNull(),
    growthRate: real('growth_rate').notNull(),
    airCo2Ppm: real('air_co2_ppm').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_telemetry_zone_time').on(table.zoneId, table.recordedAt),
    index('idx_telemetry_recorded_at').on(table.recordedAt),
  ]
);

export const alerts = pgTable(
  'alerts',
  {
    id: serial('id').primaryKey(),
    zoneId: integer('zone_id')
      .references(() => greenhouseZones.id, { onDelete: 'cascade' })
      .notNull(),
    metric: text('metric').notNull(),
    severity: text('severity').notNull(), // 'info' | 'warning' | 'critical'
    message: text('message').notNull(),
    acknowledged: boolean('acknowledged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_alerts_zone_ack').on(table.zoneId, table.acknowledged)]
);

export const zoneSchedules = pgTable('zone_schedules', {
  id: serial('id').primaryKey(),
  zoneId: integer('zone_id')
    .references(() => greenhouseZones.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(), // 'irrigation' | 'lighting' | 'nutrient' | 'harvest'
  startTime: text('start_time').notNull(),
  durationMin: integer('duration_min').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const zoneThresholds = pgTable('zone_thresholds', {
  id: serial('id').primaryKey(),
  zoneId: integer('zone_id')
    .references(() => greenhouseZones.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  targetTempC: real('target_temp_c').notNull().default(23),
  targetMoisturePct: real('target_moisture_pct').notNull().default(68),
  targetCo2Ppm: real('target_co2_ppm').notNull().default(900),
  targetEcMs: real('target_ec_ms').notNull().default(2.1),
  lightPhotoperiodH: real('light_photoperiod_h').notNull().default(15),
  autoIrrigation: boolean('auto_irrigation').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type GreenhouseZoneRow = typeof greenhouseZones.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type TelemetryReadingRow = typeof telemetryReadings.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
export type ZoneScheduleRow = typeof zoneSchedules.$inferSelect;
export type ZoneThresholdRow = typeof zoneThresholds.$inferSelect;
