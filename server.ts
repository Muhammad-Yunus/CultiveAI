import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { asc, desc, eq, count } from 'drizzle-orm';

import { db, isDbConfigured, sqlClient } from './src/db';
import {
  users,
  apiKeys,
  greenhouseZones,
  telemetryReadings,
  zoneThresholds,
  zoneSchedules,
  alerts,
} from './src/db/schema';
import {
  hashPassword,
  verifyPassword,
  signUserToken,
  verifyUserToken,
  generateIngestApiKey,
  requireUserAuth,
  requireIngestApiKey,
  type AuthenticatedRequest,
} from './src/server/auth';
import {
  ensureBaseInfrastructure,
  validateTelemetryInput,
  ingestSingleTelemetry,
  ingestBatchTelemetry,
  getDashboardOverview,
  exportTelemetryCsv,
} from './src/server/telemetryService';
import { buildOpenApiSpec } from './src/server/swagger';
import { runGreenhouseRagAssistant, type ChatTurn } from './src/server/ragAssistant';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        // Allow same-origin requests and local dev tools
        callback(null, origin || true);
      },
      methods: ['GET', 'POST'],
    },
  });

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // Warn clearly in production if AUTH_SECRET is missing or short
  if (isProduction && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.trim().length < 16)) {
    console.warn(
      '[CultivAI Warning] AUTH_SECRET is not set (>=16 chars). Ephemeral secret will invalidate user sessions on restart or across replicas.'
    );
  }

  // Lightweight sliding-window rate limiter for auth endpoints with stale-IP pruning
  const authHits = new Map<string, number[]>();
  app.use('/api/auth', (req, res, next) => {
    if (req.method !== 'POST') {
      next();
      return;
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60_000;
    if (authHits.size > 1000) {
      for (const [k, times] of authHits.entries()) {
        if (times.every((t) => now - t >= windowMs)) {
          authHits.delete(k);
        }
      }
    }
    const recent = (authHits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= 20) {
      res.status(429).json({ error: 'Too many authentication attempts. Please wait a minute.' });
      return;
    }
    recent.push(now);
    authHits.set(ip, recent);
    next();
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    const token =
      typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const verifiedUser = token ? verifyUserToken(token) : null;

    socket.data.userId = verifiedUser?.sub ?? null;
    socket.join('telemetry:live');

    socket.emit('socket:ready', {
      connected: true,
      authenticated: Boolean(verifiedUser),
      serverTime: new Date().toISOString(),
    });

    socket.on('zone:subscribe', (payload: { zoneId?: number }) => {
      const zoneId = Number(payload?.zoneId);
      if (Number.isInteger(zoneId) && zoneId > 0) {
        for (const room of socket.rooms) {
          if (room.startsWith('zone:')) socket.leave(room);
        }
        socket.join(`zone:${zoneId}`);
      }
    });
  });

  // Ensure default zone & thresholds exist on startup if DB is configured
  if (isDbConfigured()) {
    ensureBaseInfrastructure().catch((err) => {
      console.error('Initial DB infrastructure check failed:', err);
    });
  }

  // Swagger OpenAPI docs
  app.get('/api/openapi.json', (req, res) => {
    const rawProto = req.header('x-forwarded-proto') || req.protocol || 'http';
    const proto = rawProto.split(',')[0].trim();
    const rawHost = req.header('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
    const host = rawHost.split(',')[0].trim();
    res.json(buildOpenApiSpec(`${proto}://${host}`));
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: '/api/openapi.json',
        persistAuthorization: true,
      },
      customSiteTitle: 'CultivAI API Documentation',
    })
  );

  // Healthcheck (verifies actual PostgreSQL connectivity when configured)
  app.get('/api/health', async (_req, res) => {
    const databaseConfigured = isDbConfigured();
    let databaseReachable = false;

    if (databaseConfigured && sqlClient) {
      try {
        await Promise.race([
          sqlClient`SELECT 1`,
          new Promise((_, reject) => setTimeout(() => reject(new Error('DB ping timeout')), 3000)),
        ]);
        databaseReachable = true;
      } catch {
        databaseReachable = false;
      }
    }

    const healthy = !databaseConfigured || databaseReachable;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'CultivAI',
      databaseConfigured,
      databaseReachable,
      timestamp: new Date().toISOString(),
    });
  });

  // =========================================================================
  // 1. APPLICATION USER AUTH ROUTES (User-Based Login / Register)
  // =========================================================================

  app.get('/api/auth/bootstrap-status', async (_req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    try {
      const [row] = await db.select({ total: count() }).from(users);
      res.json({ hasUsers: Number(row?.total ?? 0) > 0 });
    } catch (err) {
      console.error('Bootstrap status error:', err);
      res.status(500).json({ error: 'Failed to check account bootstrap status.' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Provide a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      return;
    }

    try {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const [userCountRow] = await db.select({ total: count() }).from(users);
      const isFirstUser = Number(userCountRow?.total ?? 0) === 0;
      const passwordHash = hashPassword(password);

      const [created] = await db
        .insert(users)
        .values({
          name,
          email,
          role: isFirstUser ? 'admin' : 'operator',
          passwordHash,
          avatarUrl: null,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
        });

      const token = signUserToken(created);
      res.status(201).json({ user: created, token });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Failed to create user account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      };
      const token = signUserToken(safeUser);
      res.json({ user: safeUser, token });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Authentication failed.' });
    }
  });

  app.get('/api/auth/me', requireUserAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // =========================================================================
  // 2. INGEST API KEY MANAGEMENT (Protected by User Login Auth)
  // =========================================================================

  app.get('/api/keys', requireUserAuth, async (_req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    try {
      const keys = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          zoneId: apiKeys.zoneId,
          isActive: apiKeys.isActive,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt));

      res.json({ keys });
    } catch (err) {
      console.error('List keys error:', err);
      res.status(500).json({ error: 'Failed to load API keys.' });
    }
  });

  app.post('/api/keys', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const zoneId =
      req.body?.zoneId !== undefined && req.body?.zoneId !== null
        ? Number(req.body.zoneId)
        : null;

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Key name must be between 2 and 80 characters.' });
      return;
    }

    try {
      const { rawKey, keyPrefix, keyHash } = generateIngestApiKey();
      const [created] = await db
        .insert(apiKeys)
        .values({
          name,
          keyPrefix,
          keyHash,
          zoneId: Number.isInteger(zoneId) && zoneId! > 0 ? zoneId : null,
          createdByUserId: req.user!.id,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          zoneId: apiKeys.zoneId,
          isActive: apiKeys.isActive,
          createdAt: apiKeys.createdAt,
        });

      res.status(201).json({
        key: created,
        rawKey, // Returned once upon creation
      });
    } catch (err) {
      console.error('Create key error:', err);
      res.status(500).json({ error: 'Failed to generate API key.' });
    }
  });

  app.delete('/api/keys/:id', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid API key ID.' });
      return;
    }

    try {
      const [updated] = await db
        .update(apiKeys)
        .set({ isActive: false })
        .where(eq(apiKeys.id, id))
        .returning({ id: apiKeys.id, isActive: apiKeys.isActive });

      if (!updated) {
        res.status(404).json({ error: 'API key not found.' });
        return;
      }

      res.json({ revoked: true, id: updated.id });
    } catch (err) {
      console.error('Revoke key error:', err);
      res.status(500).json({ error: 'Failed to revoke API key.' });
    }
  });

  // =========================================================================
  // 3. EXTERNAL DATA INGESTION API (Strictly API Key Auth Only)
  // =========================================================================

  app.get('/api/ingest/health', requireIngestApiKey, (req: AuthenticatedRequest, res) => {
    res.json({
      status: 'ready',
      keyName: req.ingestKey?.name,
      keyPrefix: req.ingestKey?.keyPrefix,
      boundZoneId: req.ingestKey?.zoneId,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ingest/telemetry', requireIngestApiKey, async (req: AuthenticatedRequest, res) => {
    const check = validateTelemetryInput(req.body);
    if (!check.valid || !check.data) {
      res.status(400).json({ error: check.error });
      return;
    }

    try {
      const { reading, alerts: newAlerts } = await ingestSingleTelemetry(
        check.data,
        req.ingestKey?.zoneId ?? null
      );

      // Instantaneous real-time broadcast via Socket.IO
      io.to('telemetry:live').emit('telemetry:new', {
        reading,
        alerts: newAlerts,
      });

      res.status(201).json({
        ingested: true,
        reading,
        alertsTriggered: newAlerts.length,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      console.error('Ingest telemetry error:', err);
      res.status(500).json({ error: 'Failed to persist telemetry reading.' });
    }
  });

  app.post('/api/ingest/batch', requireIngestApiKey, async (req: AuthenticatedRequest, res) => {
    const list = req.body?.readings;
    if (!Array.isArray(list) || list.length === 0 || list.length > 250) {
      res.status(400).json({
        error: 'Body must contain a non-empty readings array (max 250 items per batch).',
      });
      return;
    }

    const validated = [];
    for (let i = 0; i < list.length; i++) {
      const check = validateTelemetryInput(list[i]);
      if (!check.valid || !check.data) {
        res.status(400).json({ error: `Item ${i}: ${check.error}` });
        return;
      }
      validated.push(check.data);
    }

    try {
      const result = await ingestBatchTelemetry(validated, req.ingestKey?.zoneId ?? null);
      if (result.latest) {
        io.to('telemetry:live').emit('telemetry:batch', {
          count: result.count,
          latest: result.latest,
          alerts: result.alerts,
        });
      }
      res.status(201).json({
        ingested: true,
        count: result.count,
        latestId: result.latest?.id ?? null,
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      console.error('Batch ingest error:', err);
      res.status(500).json({ error: 'Failed to persist telemetry batch.' });
    }
  });

  // =========================================================================
  // 4. TELEMETRY READ, EXPORT, ZONES, THRESHOLDS, SCHEDULES & ALERTS
  // =========================================================================

  app.get('/api/telemetry/overview', async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    try {
      const data = await getDashboardOverview(
        zoneId && Number.isInteger(zoneId) ? zoneId : undefined
      );
      res.json(data);
    } catch (err) {
      console.error('Overview query error:', err);
      res.status(500).json({ error: 'Failed to load greenhouse telemetry overview.' });
    }
  });

  app.get('/api/telemetry/history', async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    try {
      const rows =
        zoneId && Number.isInteger(zoneId)
          ? await db
              .select()
              .from(telemetryReadings)
              .where(eq(telemetryReadings.zoneId, zoneId))
              .orderBy(desc(telemetryReadings.recordedAt), desc(telemetryReadings.id))
              .limit(limit)
          : await db
              .select()
              .from(telemetryReadings)
              .orderBy(desc(telemetryReadings.recordedAt), desc(telemetryReadings.id))
              .limit(limit);

      res.json({ readings: rows });
    } catch (err) {
      console.error('History query error:', err);
      res.status(500).json({ error: 'Failed to load telemetry history.' });
    }
  });

  app.get('/api/telemetry/export', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    try {
      const csv = await exportTelemetryCsv(
        zoneId && Number.isInteger(zoneId) ? zoneId : undefined,
        500
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cultivai-telemetry.csv"');
      res.send(csv);
    } catch (err) {
      console.error('Export CSV error:', err);
      res.status(500).json({ error: 'Failed to export CSV telemetry.' });
    }
  });

  app.get('/api/zones', async (_req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    try {
      const zones = await ensureBaseInfrastructure();
      res.json({ zones: zones ?? [] });
    } catch (err) {
      console.error('Zones error:', err);
      res.status(500).json({ error: 'Failed to load greenhouse zones.' });
    }
  });

  app.post('/api/zones', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const cropType =
      typeof req.body?.cropType === 'string' && req.body.cropType.trim()
        ? req.body.cropType.trim()
        : 'Butterhead Lettuce';

    if (!/^[A-Z0-9_-]{3,24}$/.test(code) || name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Provide a valid alphanumeric zone code and name.' });
      return;
    }

    try {
      const [zone] = await db
        .insert(greenhouseZones)
        .values({ code, name, cropType, status: 'nominal' })
        .returning();

      await db.insert(zoneThresholds).values({
        zoneId: zone.id,
        targetTempC: 23,
        targetMoisturePct: 68,
        targetCo2Ppm: 900,
        targetEcMs: 2.1,
        lightPhotoperiodH: 15,
        autoIrrigation: true,
      });

      io.to('telemetry:live').emit('zone:updated', { zoneId: zone.id });
      res.status(201).json({ zone });
    } catch (err) {
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === '23505') {
        res.status(409).json({ error: `Zone code '${code}' already exists.` });
        return;
      }
      console.error('Create zone error:', err);
      res.status(500).json({ error: 'Failed to create greenhouse zone.' });
    }
  });

  app.patch('/api/thresholds/:zoneId', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = Number(req.params.zoneId);
    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      res.status(400).json({ error: 'Invalid zoneId.' });
      return;
    }

    const body = req.body ?? {};
    const updates: Partial<typeof zoneThresholds.$inferInsert> = {
      updatedAt: new Date(),
    };

    const numericRules: Array<[keyof typeof updates, unknown, number, number, string]> = [
      ['targetTempC', body.targetTempC, 10, 45, 'targetTempC must be between 10 and 45 °C.'],
      ['targetMoisturePct', body.targetMoisturePct, 10, 100, 'targetMoisturePct must be between 10 and 100%.'],
      ['targetCo2Ppm', body.targetCo2Ppm, 200, 3000, 'targetCo2Ppm must be between 200 and 3000 ppm.'],
      ['targetEcMs', body.targetEcMs, 0.2, 6.0, 'targetEcMs must be between 0.2 and 6.0 mS.'],
      ['lightPhotoperiodH', body.lightPhotoperiodH, 0, 24, 'lightPhotoperiodH must be between 0 and 24 hours.'],
    ];

    for (const [key, rawVal, min, max, msg] of numericRules) {
      if (rawVal !== undefined) {
        if (typeof rawVal !== 'number' || !Number.isFinite(rawVal) || rawVal < min || rawVal > max) {
          res.status(400).json({ error: msg });
          return;
        }
        (updates as Record<string, unknown>)[key] = rawVal;
      }
    }

    if (body.autoIrrigation !== undefined) {
      if (typeof body.autoIrrigation !== 'boolean') {
        res.status(400).json({ error: 'autoIrrigation must be a boolean.' });
        return;
      }
      updates.autoIrrigation = body.autoIrrigation;
    }

    try {
      const [updated] = await db
        .update(zoneThresholds)
        .set(updates)
        .where(eq(zoneThresholds.zoneId, zoneId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'Zone threshold settings not found.' });
        return;
      }

      io.to('telemetry:live').emit('zone:updated', { zoneId });
      res.json({ threshold: updated });
    } catch (err) {
      console.error('Update thresholds error:', err);
      res.status(500).json({ error: 'Failed to update zone thresholds.' });
    }
  });

  app.get('/api/schedules', async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : undefined;
    try {
      const rows =
        zoneId && Number.isInteger(zoneId) && zoneId > 0
          ? await db
              .select()
              .from(zoneSchedules)
              .where(eq(zoneSchedules.zoneId, zoneId))
              .orderBy(asc(zoneSchedules.startTime))
          : await db.select().from(zoneSchedules).orderBy(asc(zoneSchedules.startTime));
      res.json({ schedules: rows });
    } catch (err) {
      console.error('List schedules error:', err);
      res.status(500).json({ error: 'Failed to load automation schedules.' });
    }
  });

  app.post('/api/schedules', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const zoneId = Number(req.body?.zoneId);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    const startTime = typeof req.body?.startTime === 'string' ? req.body.startTime.trim() : '';
    const durationMin = Number(req.body?.durationMin);

    if (
      !Number.isInteger(zoneId) ||
      zoneId <= 0 ||
      title.length < 2 ||
      title.length > 120 ||
      !['irrigation', 'lighting', 'nutrient', 'harvest'].includes(category) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !Number.isInteger(durationMin) ||
      durationMin < 1 ||
      durationMin > 1440
    ) {
      res.status(400).json({ error: 'Invalid schedule payload.' });
      return;
    }

    try {
      const [zone] = await db
        .select({ id: greenhouseZones.id })
        .from(greenhouseZones)
        .where(eq(greenhouseZones.id, zoneId))
        .limit(1);
      if (!zone) {
        res.status(404).json({ error: 'Greenhouse zone not found.' });
        return;
      }

      const [created] = await db
        .insert(zoneSchedules)
        .values({ zoneId, title, category, startTime, durationMin, enabled: true })
        .returning();

      io.to('telemetry:live').emit('zone:updated', { zoneId });
      res.status(201).json({ schedule: created });
    } catch (err) {
      console.error('Create schedule error:', err);
      res.status(500).json({ error: 'Failed to create schedule.' });
    }
  });

  app.patch('/api/schedules/:id', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const id = Number(req.params.id);
    const enabled = Boolean(req.body?.enabled);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid schedule id.' });
      return;
    }
    try {
      const [updated] = await db
        .update(zoneSchedules)
        .set({ enabled })
        .where(eq(zoneSchedules.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: 'Schedule not found.' });
        return;
      }
      io.to('telemetry:live').emit('zone:updated', { zoneId: updated.zoneId });
      res.json({ schedule: updated });
    } catch (err) {
      console.error('Toggle schedule error:', err);
      res.status(500).json({ error: 'Failed to update schedule.' });
    }
  });

  app.delete('/api/schedules/:id', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid schedule id.' });
      return;
    }
    try {
      const [deleted] = await db
        .delete(zoneSchedules)
        .where(eq(zoneSchedules.id, id))
        .returning();
      if (!deleted) {
        res.status(404).json({ error: 'Schedule not found.' });
        return;
      }
      io.to('telemetry:live').emit('zone:updated', { zoneId: deleted.zoneId });
      res.json({ deleted: true, id: deleted.id });
    } catch (err) {
      console.error('Delete schedule error:', err);
      res.status(500).json({ error: 'Failed to delete schedule.' });
    }
  });

  app.patch('/api/alerts/:id/ack', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid alert id.' });
      return;
    }
    try {
      const [updated] = await db
        .update(alerts)
        .set({ acknowledged: true })
        .where(eq(alerts.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: 'Alert not found.' });
        return;
      }
      io.to('telemetry:live').emit('zone:updated', { zoneId: updated.zoneId });
      res.json({ alert: updated });
    } catch (err) {
      console.error('Ack alert error:', err);
      res.status(500).json({ error: 'Failed to acknowledge alert.' });
    }
  });

  // =========================================================================
  // 5. SERVER-SIDE OPENAI-COMPATIBLE GREENHOUSE RAG AI ASSISTANT
  // =========================================================================

  app.post('/api/ai/assistant', requireUserAuth, async (req, res) => {
    if (!db) {
      res.status(503).json({ error: 'Database not configured.' });
      return;
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const zoneId = req.body?.zoneId ? Number(req.body.zoneId) : undefined;
    const history = Array.isArray(req.body?.history)
      ? (req.body.history as ChatTurn[])
      : undefined;

    if (prompt.length < 2 || prompt.length > 2000) {
      res.status(400).json({ error: 'Prompt must be between 2 and 2000 characters.' });
      return;
    }

    try {
      const result = await runGreenhouseRagAssistant({
        prompt,
        zoneId: zoneId && Number.isInteger(zoneId) ? zoneId : undefined,
        history,
      });

      res.json(result);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      const status = e.statusCode ?? 502;
      console.error('RAG AI Assistant error:', e.message);
      res.status(status).json({ error: e.message });
    }
  });

  // =========================================================================
  // 6. VITE DEV MIDDLEWARE OR STATIC PRODUCTION BUILD
  // =========================================================================

  // Return clean JSON 404 for unmatched API endpoints
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          index: false,
          maxAge: '1d',
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CultivAI server listening on http://0.0.0.0:${PORT}`);
    console.log(`Swagger UI docs available at http://0.0.0.0:${PORT}/api/docs`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down CultivAI gracefully...`);
    io.close();
    httpServer.close(async () => {
      if (sqlClient) {
        await sqlClient.end({ timeout: 5 }).catch(() => {});
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
