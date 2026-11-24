/**
 * Structured JSON logger. Never pass raw personal or payment data (card numbers, full phone numbers, tokens)
 * into log fields: use ids and references instead.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "test" ? "warn" : "info");

function emit(level: Level, event: string, fields?: Record<string, unknown>) {
  if (order[level] < order[min]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (e: string, f?: Record<string, unknown>) => emit("debug", e, f),
  info: (e: string, f?: Record<string, unknown>) => emit("info", e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit("warn", e, f),
  error: (e: string, f?: Record<string, unknown>) => emit("error", e, f),
};
