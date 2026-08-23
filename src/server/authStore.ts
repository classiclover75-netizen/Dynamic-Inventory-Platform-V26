import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getStorageMode } from './dbConnection';

export type AuthRole = 'master' | 'slave';

export interface AuthUserRecord {
  username: string;
  role: AuthRole;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthSessionRecord {
  token: string;
  username: string;
  role: AuthRole;
  rememberMe: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface PublicUser {
  username: string;
  role: AuthRole;
  createdAt: string;
}

const REMEMBER_ME_DAYS = 15;
const SHORT_SESSION_HOURS = 24;
const AUTH_FILE_PATH = path.join(process.cwd(), 'auth.json');

const authUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: String, required: true }
});

const authSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  role: { type: String, required: true },
  rememberMe: { type: Boolean, required: true, default: false },
  expiresAt: { type: String, required: true },
  createdAt: { type: String, required: true }
});

const AuthUser: any = (mongoose.models as any).AuthUser || mongoose.model('AuthUser', authUserSchema);
const AuthSession: any = (mongoose.models as any).AuthSession || mongoose.model('AuthSession', authSessionSchema);

function isMongoMode(): boolean {
  return getStorageMode().mode === 'mongodb';
}

interface AuthFileShape {
  users: AuthUserRecord[];
  sessions: AuthSessionRecord[];
}

async function readAuthFile(): Promise<AuthFileShape> {
  try {
    const raw = await fs.promises.readFile(AUTH_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    return { users, sessions };
  } catch {
    return { users: [], sessions: [] };
  }
}

async function writeAuthFile(data: AuthFileShape): Promise<void> {
  const tmpPath = `${AUTH_FILE_PATH}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(data));
  await fs.promises.rename(tmpPath, AUTH_FILE_PATH);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiryIso(rememberMe: boolean): string {
  const ms = rememberMe
    ? REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
    : SHORT_SESSION_HOURS * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function windowMs(rememberMe: boolean): number {
  return rememberMe
    ? REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
    : SHORT_SESSION_HOURS * 60 * 60 * 1000;
}

export function validateUsername(username: unknown): string | null {
  if (typeof username !== 'string') return 'Username is required.';
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return 'Username must be between 3 and 32 characters.';
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return 'Username can contain only letters, numbers, dot, underscore and hyphen.';
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password must be 200 characters or fewer.';
  return null;
}

function toPublicUser(user: AuthUserRecord): PublicUser {
  return { username: user.username, role: user.role, createdAt: user.createdAt };
}

export async function findUser(username: string): Promise<AuthUserRecord | null> {
  const key = username.trim().toLowerCase();
  if (isMongoMode()) {
    const doc = await AuthUser.findOne({ username: key }).lean();
    return doc ? (doc as AuthUserRecord) : null;
  }
  const data = await readAuthFile();
  return data.users.find((u) => u.username === key) || null;
}

export async function hasMasterUser(): Promise<boolean> {
  if (isMongoMode()) {
    const count = await AuthUser.countDocuments({ role: 'master' });
    return count > 0;
  }
  const data = await readAuthFile();
  return data.users.some((u) => u.role === 'master');
}

export async function listUsers(): Promise<PublicUser[]> {
  if (isMongoMode()) {
    const docs = await AuthUser.find({}).lean();
    return (docs as AuthUserRecord[]).map(toPublicUser);
  }
  const data = await readAuthFile();
  return data.users.map(toPublicUser);
}

export async function createUser(username: string, password: string, role: AuthRole): Promise<PublicUser> {
  const key = username.trim().toLowerCase();
  const existing = await findUser(key);
  if (existing) {
    throw new Error('USERNAME_TAKEN');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const record: AuthUserRecord = {
    username: key,
    role,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: nowIso()
  };
  if (isMongoMode()) {
    await AuthUser.create(record);
  } else {
    const data = await readAuthFile();
    data.users.push(record);
    await writeAuthFile(data);
  }
  return toPublicUser(record);
}

export async function deleteSlaveUser(username: string): Promise<boolean> {
  const key = username.trim().toLowerCase();
  const user = await findUser(key);
  if (!user || user.role === 'master') return false;
  if (isMongoMode()) {
    await AuthUser.deleteOne({ username: key });
    await AuthSession.deleteMany({ username: key });
  } else {
    const data = await readAuthFile();
    data.users = data.users.filter((u) => u.username !== key);
    data.sessions = data.sessions.filter((s) => s.username !== key);
    await writeAuthFile(data);
  }
  return true;
}

export async function verifyCredentials(username: unknown, password: unknown): Promise<AuthUserRecord | null> {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const user = await findUser(username);
  if (!user) return null;
  const candidate = hashPassword(password, user.salt);
  if (!safeEqual(candidate, user.passwordHash)) return null;
  return user;
}

export async function createSession(user: AuthUserRecord, rememberMe: boolean): Promise<AuthSessionRecord> {
  const record: AuthSessionRecord = {
    token: crypto.randomBytes(32).toString('hex'),
    username: user.username,
    role: user.role,
    rememberMe,
    expiresAt: expiryIso(rememberMe),
    createdAt: nowIso()
  };
  if (isMongoMode()) {
    await AuthSession.create(record);
  } else {
    const data = await readAuthFile();
    data.sessions = data.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
    data.sessions.push(record);
    await writeAuthFile(data);
  }
  return record;
}

export async function getSession(token: unknown): Promise<AuthSessionRecord | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  let session: AuthSessionRecord | null = null;
  if (isMongoMode()) {
    const doc = await AuthSession.findOne({ token }).lean();
    session = doc ? (doc as AuthSessionRecord) : null;
  } else {
    const data = await readAuthFile();
    session = data.sessions.find((s) => s.token === token) || null;
  }
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }
  const rememberMe = session.rememberMe === true;
  const newExpiresAt = new Date(Date.now() + windowMs(rememberMe)).toISOString();
  if (isMongoMode()) {
    await AuthSession.updateOne({ token }, { $set: { expiresAt: newExpiresAt } });
  } else {
    const data = await readAuthFile();
    const idx = data.sessions.findIndex((s) => s.token === token);
    if (idx !== -1) {
      data.sessions[idx].expiresAt = newExpiresAt;
      await writeAuthFile(data);
    }
  }
  return { ...session, expiresAt: newExpiresAt };
}

export async function deleteSession(token: unknown): Promise<void> {
  if (typeof token !== 'string' || token.length === 0) return;
  if (isMongoMode()) {
    await AuthSession.deleteOne({ token });
    return;
  }
  const data = await readAuthFile();
  data.sessions = data.sessions.filter((s) => s.token !== token);
  await writeAuthFile(data);
}
