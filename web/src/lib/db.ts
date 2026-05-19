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
  `);
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
