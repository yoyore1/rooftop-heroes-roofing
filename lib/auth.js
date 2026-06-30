// Dashboard auth: a single shared admin password gates the leads dashboard.
// On success we issue an HMAC-signed, HttpOnly session cookie — no database
// or third-party auth needed. Requires ADMIN_PASSWORD and SESSION_SECRET.

import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const COOKIE = "rh_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

export function authConfigured() {
  return Boolean(PASSWORD && SECRET);
}

// Constant-time password check (avoids timing leaks).
export function passwordOk(input) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function makeSessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `admin.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  return buildCookie(COOKIE, token, MAX_AGE);
}

export function clearSessionCookie() {
  return buildCookie(COOKIE, "", 0);
}

// True only for a present, well-formed, unexpired, correctly-signed cookie.
export function isAuthed(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  const expected = sign(`${who}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return who === "admin";
}

function buildCookie(name, value, maxAge) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  // Secure is on by default (required in production). Local http dev sets
  // COOKIE_INSECURE=1 so the cookie still works over http://localhost.
  if (process.env.COOKIE_INSECURE !== "1") parts.push("Secure");
  return parts.join("; ");
}

function readCookie(req, name) {
  const raw = req.headers?.cookie || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
