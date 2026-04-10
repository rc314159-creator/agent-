import { NextRequest } from "next/server";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data", "projects");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function readIndex(): Promise<{ projects: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> }> {
  ensureDataDir();
  if (!existsSync(INDEX_FILE)) {
    const initial = { projects: [] };
    await fs.writeFile(INDEX_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const content = await fs.readFile(INDEX_FILE, "utf-8");
  return JSON.parse(content);
}

async function writeIndex(data: { projects: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> }) {
  await fs.writeFile(INDEX_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const index = await readIndex();
    return Response.json({ success: true, data: index.projects });
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return Response.json({ error: "Failed to read projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

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

    const index = await readIndex();
    index.projects.push({ id, name, createdAt: now, updatedAt: now });
    await writeIndex(index);

    return Response.json({ success: true, data: meta }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }
}
