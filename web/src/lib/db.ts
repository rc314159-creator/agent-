/**
 * SQLite client for the voiceprint meeting recorder.
 *
 * Schema: see docs/开发计划/2026.05.19/voiceprint-meeting-recorder.md §3.
 * Three tables: speakers / meetings / utterances. Centroid & raw_embedding
 * are stored as raw float32 BLOBs (no JSON, no base64 — direct buffer view).
 *
 * Connection is cached on globalThis so Next.js dev HMR doesn't open a new
 * file handle on every reload.
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// data/ lives in the project root, one level above web/.
const PROJECT_ROOT = path.resolve(process.cwd(), process.cwd().endsWith("/web") ? ".." : ".");
const DATA_DIR = process.env.VOICEPRINT_DATA_DIR ?? path.join(PROJECT_ROOT, "data");
const DB_PATH = process.env.VOICEPRINT_DB_PATH ?? path.join(DATA_DIR, "vp.db");
const SEGMENTS_DIR = path.join(DATA_DIR, "segments");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SEGMENTS_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __vpDb?: Database.Database };

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS speakers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      centroid BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS utterances (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      speaker_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      start_ms INTEGER NOT NULL DEFAULT 0,
      end_ms INTEGER NOT NULL DEFAULT 0,
      audio_path TEXT,
      raw_embedding BLOB,
      confidence REAL NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ut_meeting ON utterances(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_ut_speaker ON utterances(speaker_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meeting_chats (
      id          TEXT PRIMARY KEY,
      meeting_id  TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );
    CREATE INDEX IF NOT EXISTS idx_mc_meeting ON meeting_chats(meeting_id);
  `);

  // R12 一次性迁移：把旧 yunwu agent 默认迁到 llmmelon（haiku 默认）。
  // 仅当 user 没有显式配置过 agent_base_url，或配置的还是 yunwu 默认时才迁。
  // 用户改过自定义 url / model 的不动。
  try {
    const cur = db.prepare("SELECT value FROM settings WHERE key = ?").get("agent_base_url") as { value: string } | undefined;
    if (!cur || /yunwu\.ai\/?$/.test(cur.value) || /yunwu\.ai\/v1\/?$/.test(cur.value)) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "agent_base_url", "https://llmmelon.cloud/v1",
      );
      // 同时把 model 也升到 haiku-4-5（除非用户已经改过非 yunwu 默认）
      const curModel = db.prepare("SELECT value FROM settings WHERE key = ?").get("agent_model") as { value: string } | undefined;
      if (!curModel || curModel.value === "claude-sonnet-4-5-20250929") {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
          "agent_model", "claude-haiku-4-5-20251001",
        );
      }
      // 旧 anthropic_api_key 是 yunwu key，迁到 agent_api_key 但**值要换成 llmmelon**
      // 不能简单复用 yunwu key 给 llmmelon——它们是不同中转
      // 这里只设 llmmelon key（来自 env），不复用旧 yunwu key
      if (process.env.LLMMELON_API_KEY) {
        const curKey = db.prepare("SELECT value FROM settings WHERE key = ?").get("agent_api_key") as { value: string } | undefined;
        if (!curKey) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
            "agent_api_key", process.env.LLMMELON_API_KEY,
          );
        }
      }
    }
  } catch { /* migration is best-effort, never blocks startup */ }

  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__vpDb) globalForDb.__vpDb = initDb();
  return globalForDb.__vpDb;
}

export function getSegmentsDir(): string {
  return SEGMENTS_DIR;
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function newId(): string {
  return randomUUID();
}

export function now(): number {
  return Date.now();
}

// ---------- BLOB <-> Float32Array helpers ----------

export function embeddingToBlob(emb: Float32Array | number[]): Buffer {
  const arr = emb instanceof Float32Array ? emb : new Float32Array(emb);
  return Buffer.from(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
}

export function blobToEmbedding(blob: Buffer | null): Float32Array | null {
  if (!blob || blob.length === 0) return null;
  // Copy out of the sqlite-owned buffer
  const copy = Buffer.from(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

// ---------- Row types ----------

export interface SpeakerRow {
  id: string;
  name: string;
  sample_count: number;
  centroid: Buffer | null;
  created_at: number;
  updated_at: number;
}

export interface MeetingRow {
  id: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
}

export interface UtteranceRow {
  id: string;
  meeting_id: string;
  speaker_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  audio_path: string | null;
  raw_embedding: Buffer | null;
  confidence: number;
  needs_review: number;
  created_at: number;
}

// ---------- Settings helpers ----------

export function getSetting(key: string): string | null {
  const row = getDb().prepare<[string], { value: string }>("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare<[], { key: string; value: string }>("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ---------- Chat message helpers ----------

export interface ChatMessageRow {
  id: string;
  meeting_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
}

export function saveChatMessage(meetingId: string, role: "user" | "assistant", content: string): void {
  getDb().prepare(
    "INSERT INTO meeting_chats (id, meeting_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(newId(), meetingId, role, content, now());
}

export function getChatMessages(meetingId: string): ChatMessageRow[] {
  return getDb().prepare<[string], ChatMessageRow>(
    "SELECT id, meeting_id, role, content, created_at FROM meeting_chats WHERE meeting_id = ? ORDER BY created_at ASC"
  ).all(meetingId);
}
