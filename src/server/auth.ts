import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users, apiKeys } from '../db/schema';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_FALLBACK_SECRET;
}

export interface AuthUserPayload {
  sub: number;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  };
  ingestKey?: {
    id: number;
    name: string;
    zoneId: number | null;
    keyPrefix: string;
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signUserToken(user: {
  id: number;
  email: string;
  name: string;
  role: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: now,
      exp: now + 60 * 60 * 24 * 7, // 7 days
    } satisfies AuthUserPayload)
  );
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

export function verifyUserToken(token: string): AuthUserPayload | null {
  try {
    if (!token || token.startsWith('cai_')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${payload}`).digest()
    );
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload)) as AuthUserPayload;
    if (!decoded.sub || typeof decoded.exp !== 'number') return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function generateIngestApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const rawKey = `cai_live_${randomPart}`;
  const keyPrefix = rawKey.slice(0, 14);
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export async function requireUserAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!db) {
    res.status(503).json({
      error: 'Database not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in environment.',
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide a valid user Bearer token.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyUserToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired user session token.' });
    return;
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('User auth lookup error:', err);
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

export async function requireIngestApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!db) {
    res.status(503).json({
      error: 'Database not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in environment.',
    });
    return;
  }

  const rawKey = req.header('X-API-Key')?.trim();
  if (!rawKey) {
    res.status(401).json({
      error: 'Missing X-API-Key header. Ingest endpoints require a dedicated API key.',
    });
    return;
  }

  if (!rawKey.startsWith('cai_live_')) {
    res.status(401).json({ error: 'Malformed ingest API key.' });
    return;
  }

  try {
    const digest = hashApiKey(rawKey);
    const [keyRecord] = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        zoneId: apiKeys.zoneId,
        keyPrefix: apiKeys.keyPrefix,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, digest), eq(apiKeys.isActive, true)))
      .limit(1);

    if (!keyRecord) {
      res.status(403).json({ error: 'Invalid or revoked ingest API key.' });
      return;
    }

    req.ingestKey = keyRecord;

    // Non-blocking audit update
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id))
      .catch((e) => console.error('Failed to update apiKey lastUsedAt:', e));

    next();
  } catch (err) {
    console.error('Ingest API key verification error:', err);
    res.status(500).json({ error: 'API key verification failed.' });
  }
}
