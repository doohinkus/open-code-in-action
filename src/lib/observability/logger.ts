type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string, fields?: Record<string, unknown>) {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>) {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>) {
    write("error", message, fields);
  },
};

const REQUEST_ID_HEADER = "x-request-id";

export function getRequestId(req: Request): string {
  const existing = req.headers.get(REQUEST_ID_HEADER)?.trim();
  if (existing) return existing;
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function hashIp(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return `ip_${(hash >>> 0).toString(36)}`;
}
