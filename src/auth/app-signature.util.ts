import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Per-app HMAC secrets, one per known client. Defense-in-depth only — a
 * secret baked into a distributed app binary isn't truly secret (it can be
 * extracted by reverse-engineering the app), so this identifies the calling
 * app for UX/telemetry purposes, not as a hard security boundary. The real
 * authorization boundary is server-side role checks (see roles.guard.ts and
 * every shop-ownership check across the codebase).
 */
export const APP_SIGNING_SECRETS: Record<string, string | undefined> = {
  client: process.env.APP_SIGNING_SECRET_CLIENT,
  provider: process.env.APP_SIGNING_SECRET_PROVIDER,
  dashboard: process.env.APP_SIGNING_SECRET_DASHBOARD,
};

/** Which Users.role values are allowed to authenticate into each app. */
export const APP_ALLOWED_ROLES: Record<string, string[]> = {
  client: ['user'],
  provider: ['provider'],
  dashboard: ['admin', 'manager', 'enroller', 'designer'],
};

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

/** HMAC-SHA256("${appId}:${timestamp}") with the app's secret, hex-encoded. */
export function verifyAppSignature(appId: string, timestamp: string, signature: string): boolean {
  const secret = APP_SIGNING_SECRETS[appId];
  if (!secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return false;

  const expected = createHmac('sha256', secret).update(`${appId}:${timestamp}`).digest('hex');
  let expectedBuf: Buffer;
  let givenBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, 'hex');
    givenBuf = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

export function isRoleAllowedForApp(appId: string, role: string): boolean {
  const allowed = APP_ALLOWED_ROLES[appId];
  if (!allowed) return true; // unknown app id: signature check already failed upstream, nothing to enforce here
  return allowed.includes(role);
}
