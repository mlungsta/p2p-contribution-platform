import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { validateEnvironment } from "./env";

const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_PREFIX = "s2";

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

function getSessionSecret(): string {
  const env = validateEnvironment();
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 16) {
    return env.SESSION_SECRET;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }

  return "dev-only-session-secret-change-me";
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string): string {
  const sig = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return sig;
}

export function createSessionToken(userId: string, now: Date = new Date()): { token: string; payload: SessionPayload } {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const body: SessionPayload = { sub: userId, iat, exp, jti: randomBytes(16).toString("hex") };
  const payload = base64UrlEncode(JSON.stringify(body));
  const signature = signPayload(payload);
  return {
    token: `v1.${payload}.${signature}`,
    payload: body
  };
}

export function verifySessionToken(token: string | null | undefined, now: Date = new Date()): SessionPayload | null {
  if (!token) return null;
  const [version, payload, signature] = token.split(".");
  if (version !== "v1" || !payload || !signature) return null;

  const expected = signPayload(payload);
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as SessionPayload;
  } catch {
    return null;
  }

  if (!parsed?.sub || typeof parsed.sub !== "string") return null;
  if (!parsed?.jti || typeof parsed.jti !== "string") return null;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof parsed.exp !== "number" || parsed.exp <= nowSeconds) return null;

  return parsed;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_PREFIX}:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== PASSWORD_PREFIX) {
    return false;
  }

  const [, salt, expectedHex] = parts;
  const derivedHex = scryptSync(password, salt, 64).toString("hex");

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const derivedBuf = Buffer.from(derivedHex, "hex");

  if (expectedBuf.length !== derivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, derivedBuf);
}

export function getSessionTokenFromRequest(headers: { get(name: string): string | null }, cookies: { get(name: string): { value: string } | undefined } | null): string | null {
  const authHeader = headers.get("authorization");
  const bearerToken = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const cookieToken = cookies?.get(SESSION_COOKIE_NAME)?.value ?? null;
  return bearerToken ?? cookieToken;
}
