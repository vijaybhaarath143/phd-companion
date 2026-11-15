import "server-only";
import type { Tx } from "@/server/db";

/** Account details only — the admin never sees anyone's research. */
export type Person = {
  userId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  accountStatus: "active" | "suspended";
  mustChangePassword: boolean;
  isAdmin: boolean;
  lastSignInAt: Date | null;
  createdAt: Date;
};

export type AuditRow = { id: string; at: Date; action: string; actor: string; subject: string | null; details: Record<string, unknown> };

export async function listPeople(tx: Tx): Promise<Person[]> {
  return tx<Person[]>`select * from app.admin_list_users()`;
}

export async function auditLog(tx: Tx, limit = 100): Promise<AuditRow[]> {
  return tx<AuditRow[]>`select id::text, at, action, actor, subject, details from app.admin_audit_log(${limit})`;
}
