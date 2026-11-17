import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { connectionConfig } from "./config";

export const randomValue = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

/** Authenticated encryption also binds the value to its owner and purpose. */
export function seal(value: unknown, owner: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", connectionConfig(false).key, iv);
  cipher.setAAD(Buffer.from(`phd-companion:chatgpt:v1:${owner}:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function unseal<T>(value: string, owner: string, purpose: string): T {
  const [version, iv, tag, data, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("Invalid credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", connectionConfig(false).key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`phd-companion:chatgpt:v1:${owner}:${purpose}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as T;
}
