import { NextRequest } from "next/server";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";
import { apiLogger } from "@/lib/logger";

const log = apiLogger("projects");

const DATA_DIR = path.join(process.cwd(), "data", "projects");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

type IndexData = { projects: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> };

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Mutex to prevent concurrent read-modify-write corruption
let indexLock: Promise<void> = Promise.resolve();

async function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const prev = indexLock;
  indexLock = new Promise((resolve) => { release = resolve; });
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
}

async function readIndex(): Promise<IndexData> {
  ensureDataDir();
  if (!existsSync(INDEX_FILE)) {
    const initial: IndexData = { projects: [] };
    await fs.writeFile(INDEX_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const content = await fs.readFile(INDEX_FILE, "utf-8");
  try {
    return JSON.parse(content);
  } catch {
    // Recovery: if JSON is corrupted, try to extract the first valid object
    log.error("index.json corrupted, attempting recovery");
    let depth = 0, end = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) {
      const recovered = JSON.parse(content.slice(0, end)) as IndexData;
      await fs.writeFile(INDEX_FILE, JSON.stringify(recovered, null, 2));
      return recovered;
    }
    const empty: IndexData = { projects: [] };
    await fs.writeFile(INDEX_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
}

async function writeIndex(data: IndexData) {
  const json = JSON.stringify(data, null, 2);
  // Write to temp file first, then rename (atomic on most filesystems)
  const tmpFile = INDEX_FILE + ".tmp";
  await fs.writeFile(tmpFile, json);
  await fs.rename(tmpFile, INDEX_FILE);
}

export async function GET() {
  try {
    const index = await readIndex();
    log.info({ count: index.projects.length }, "Listed projects");
    return Response.json({ success: true, data: index.projects });
  } catch (err) {
    log.error({ err }, "GET /api/projects error");
    return Response.json({ error: "Failed to read projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    log.info({ name }, "Creating project");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const projectDir = path.join(DATA_DIR, id);

    mkdirSync(projectDir, { recursive: true });

    const meta = { id, name, createdAt: now, updatedAt: now, canvasMode: "outline" };

    await Promise.all([
      fs.writeFile(path.join(projectDir, "meta.json"), JSON.stringify(meta, null, 2)),
      fs.writeFile(path.join(projectDir, "outline.html"), ""),
      fs.writeFile(path.join(projectDir, "mindmap.json"), "null"),
      fs.writeFile(path.join(projectDir, "whiteboard.json"), "null"),
      fs.writeFile(path.join(projectDir, "templates.json"), JSON.stringify({ activeTemplate: null, data: {} }, null, 2)),
      fs.writeFile(path.join(projectDir, "transcripts.json"), "[]"),
      fs.writeFile(path.join(projectDir, "chat.json"), "[]"),
    ]);

    await withIndexLock(async () => {
      const index = await readIndex();
      index.projects.push({ id, name, createdAt: now, updatedAt: now });
      await writeIndex(index);
    });

    log.info({ id, name }, "Project created");
    return Response.json({ success: true, data: meta }, { status: 201 });
  } catch (err) {
    log.error({ err }, "POST /api/projects error");
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }
}
