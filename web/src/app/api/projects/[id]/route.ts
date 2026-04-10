import { NextRequest } from "next/server";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { apiLogger } from "@/lib/logger";

const log = apiLogger("projects/[id]");

const DATA_DIR = path.join(process.cwd(), "data", "projects");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

type ProjectParams = { params: Promise<{ id: string }> };

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

async function readIndex() {
  if (!existsSync(INDEX_FILE)) return { projects: [] };
  const content = await fs.readFile(INDEX_FILE, "utf-8");
  return JSON.parse(content) as { projects: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> };
}

function projectDir(id: string) {
  return path.join(DATA_DIR, id);
}

export async function GET(
  _request: NextRequest,
  { params }: ProjectParams
) {
  try {
    const { id } = await params;
    const dir = projectDir(id);

    if (!existsSync(dir)) {
      log.warn({ id }, "Project not found");
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    log.info({ id }, "Loading project");
    const [meta, outline, mindmap, whiteboard, templates, transcripts, chat] = await Promise.all([
      readJSON(path.join(dir, "meta.json"), null),
      fs.readFile(path.join(dir, "outline.html"), "utf-8").catch(() => ""),
      readJSON(path.join(dir, "mindmap.json"), null),
      readJSON(path.join(dir, "whiteboard.json"), null),
      readJSON(path.join(dir, "templates.json"), { activeTemplate: null, data: {} }),
      readJSON(path.join(dir, "transcripts.json"), []),
      readJSON(path.join(dir, "chat.json"), []),
    ]);

    return Response.json({
      success: true,
      data: { meta, outline, mindmap, whiteboard, templates, transcripts, chat },
    });
  } catch (err) {
    log.error({ err }, "GET /api/projects/[id] error");
    return Response.json({ error: "Failed to read project" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: ProjectParams
) {
  try {
    const { id } = await params;
    const dir = projectDir(id);

    if (!existsSync(dir)) {
      log.warn({ id }, "Project not found for update");
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    log.info({ id, fields: Object.keys(body) }, "Updating project");
    const writes: Promise<void>[] = [];

    if ("outline" in body) {
      writes.push(fs.writeFile(path.join(dir, "outline.html"), body.outline ?? ""));
    }
    if ("mindmap" in body) {
      writes.push(fs.writeFile(path.join(dir, "mindmap.json"), JSON.stringify(body.mindmap, null, 2)));
    }
    if ("whiteboard" in body) {
      writes.push(fs.writeFile(path.join(dir, "whiteboard.json"), JSON.stringify(body.whiteboard, null, 2)));
    }
    if ("templates" in body) {
      writes.push(fs.writeFile(path.join(dir, "templates.json"), JSON.stringify(body.templates, null, 2)));
    }
    if ("transcripts" in body) {
      writes.push(fs.writeFile(path.join(dir, "transcripts.json"), JSON.stringify(body.transcripts, null, 2)));
    }
    if ("chat" in body) {
      writes.push(fs.writeFile(path.join(dir, "chat.json"), JSON.stringify(body.chat, null, 2)));
    }

    const now = new Date().toISOString();

    if ("meta" in body) {
      const currentMeta = await readJSON(path.join(dir, "meta.json"), {}) as Record<string, unknown>;
      const updatedMeta = { ...currentMeta, ...body.meta, id, updatedAt: now };
      writes.push(fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(updatedMeta, null, 2)));

      // Sync name to index if changed
      if (body.meta?.name) {
        writes.push(
          readIndex().then(async (index) => {
            const entry = index.projects.find((p) => p.id === id);
            if (entry) {
              entry.name = body.meta.name;
              entry.updatedAt = now;
              await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
            }
          })
        );
      }
    } else {
      // Always update updatedAt in meta even if meta not in body
      const currentMeta = await readJSON(path.join(dir, "meta.json"), {}) as Record<string, unknown>;
      writes.push(fs.writeFile(path.join(dir, "meta.json"), JSON.stringify({ ...currentMeta, updatedAt: now }, null, 2)));
    }

    // Update index updatedAt
    writes.push(
      readIndex().then(async (index) => {
        const entry = index.projects.find((p) => p.id === id);
        if (entry) {
          entry.updatedAt = now;
          await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
        }
      })
    );

    await Promise.all(writes);

    log.info({ id }, "Project updated");
    return Response.json({ success: true });
  } catch (err) {
    log.error({ err }, "PUT /api/projects/[id] error");
    return Response.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: ProjectParams
) {
  try {
    const { id } = await params;
    const dir = projectDir(id);

    if (!existsSync(dir)) {
      log.warn({ id }, "Project not found for delete");
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    await fs.rm(dir, { recursive: true, force: true });

    const index = await readIndex();
    index.projects = index.projects.filter((p) => p.id !== id);
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));

    log.info({ id }, "Project deleted");
    return Response.json({ success: true });
  } catch (err) {
    log.error({ err }, "DELETE /api/projects/[id] error");
    return Response.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
