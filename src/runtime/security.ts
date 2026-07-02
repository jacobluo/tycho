export function sessionCookieAttributes(nodeEnv = process.env.NODE_ENV): string[] {
  if (nodeEnv === "production") {
    return ["HttpOnly", "SameSite=Strict", "Secure"];
  }
  return ["HttpOnly", "SameSite=Lax"];
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function sameOriginForHost(origin: string, host: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized || !host) {
    return false;
  }
  return normalized === `https://${host}` || normalized === `http://${host}`;
}

export function isAllowedWebSocketOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowedOriginsEnv = process.env.TYCHO_ALLOWED_ORIGINS
): boolean {
  if (!origin) {
    return true;
  }
  if (host && sameOriginForHost(origin, host)) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }
  const allowedOrigins = (allowedOriginsEnv || "")
    .split(",")
    .map((candidate) => normalizeOrigin(candidate.trim()))
    .filter((candidate): candidate is string => Boolean(candidate));
  return allowedOrigins.includes(normalized);
}
