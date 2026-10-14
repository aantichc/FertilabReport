import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

function key(purpose) {
  const value = process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("Email encryption key is not configured");
  const master = Buffer.from(value, "base64");
  if (master.length !== 32) throw new Error("Invalid email encryption key");
  return Buffer.from(hkdfSync("sha256", master, "fertilab-notifications-v1", purpose, 32));
}

export function normalizeEmail(value) {
  if (typeof value !== "string") throw new Error("Invalid email address");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)) throw new Error("Invalid email address");
  return email;
}

export function encryptEmail(value, context) {
  const email = normalizeEmail(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("encryption"), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function decryptEmail(value, context) {
  if (typeof value !== "string" || !/^enc:v1:[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encrypted email");
  const data = Buffer.from(value.slice(7), "base64url");
  if (data.length < 29) throw new Error("Invalid encrypted email");
  const decipher = createDecipheriv("aes-256-gcm", key("encryption"), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(12, 28));
  return normalizeEmail(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8"));
}

export function emailFingerprint(value) {
  return createHmac("sha256", key("lookup")).update(normalizeEmail(value)).digest("hex");
}

export const emailContext = (table, id) => `${table}:${id}:recipients`;

export function encodeEmails(emails, table, id) {
  return emails.map(email => encryptEmail(email, emailContext(table, id)));
}

export function decodeEmails(emails, table, id) {
  return emails.map(email => decryptEmail(email, emailContext(table, id)));
}
