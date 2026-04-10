import pino from "pino";
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from "fs";
import { join } from "path";

const isDev = process.env.NODE_ENV !== "production";
const LOG_DIR = join(process.cwd(), "logs");

// Ensure log directory exists
if (typeof window === "undefined") {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // ignore in edge runtime or build
  }
}

/**
 * Core pino logger with structured JSON output.
 * - Dev: pino-pretty for console + file logging
 * - Prod: JSON to stdout + file
 */
export const logger = pino({
  level: isDev ? "debug" : "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? {
        targets: [
          {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
            level: "debug",
          },
          {
            target: "pino/file",
            options: { destination: join(LOG_DIR, "app.log"), mkdir: true },
            level: "debug",
          },
        ],
      }
    : {
        target: "pino/file",
        options: { destination: join(LOG_DIR, "app.log"), mkdir: true },
      },
});

/**
 * Create a child logger for an API route.
 * Automatically includes route name in every log entry.
 */
export function apiLogger(routeName: string) {
  return logger.child({ route: routeName });
}

/**
 * Log an API request with timing.
 * Usage:
 *   const end = logRequest(log, req);
 *   // ... handle request ...
 *   end(200);
 */
export function logRequest(
  log: pino.Logger,
  method: string,
  path: string,
  extra?: Record<string, unknown>
) {
  const start = Date.now();
  log.info({ method, path, ...extra }, `→ ${method} ${path}`);

  return function end(status: number, responseExtra?: Record<string, unknown>) {
    const duration = Date.now() - start;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log[level](
      { method, path, status, duration_ms: duration, ...responseExtra },
      `← ${method} ${path} ${status} (${duration}ms)`
    );
  };
}

/**
 * Write a structured log entry to a dedicated query-friendly log file.
 * Each line is a JSON object, easily parseable by grep/jq.
 */
export function writeAuditLog(entry: {
  event: string;
  route?: string;
  method?: string;
  status?: number;
  duration_ms?: number;
  detail?: Record<string, unknown>;
}) {
  if (typeof window !== "undefined") return;
  try {
    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }) + "\n";
    appendFileSync(join(LOG_DIR, "audit.jsonl"), line);
  } catch {
    // ignore write failures
  }
}
