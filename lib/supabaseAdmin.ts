import dotenv from "dotenv";
dotenv.config();

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — created on first use, not at module load time.
// This avoids the ESM hoisting problem where env vars aren't set yet
// when this module is first evaluated.
let _client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
      "Make sure your .env file has both values filled in (not placeholder text).",
    );
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}

// Proxy so callers can still write `supabase.from(...)` unchanged.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

// -------------------------
// ROW → PROFILE MAPPER
// -------------------------
export function rowToProfile(row: Record<string, any>) {
  return {
    id: row.firebase_uid,
    supabaseId: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role as string,
    program: row.program ?? null,
    yearLevel: row.year_level ?? null,
    school: row.school ?? null,
    phone: row.phone ?? null,
    avatar: row.avatar ?? null,
    groupId: row.group_id ?? null,
    adviserId: row.adviser_firebase_uid ?? null,
    isDeleted: row.is_deleted as boolean,
    status: (row.status as string) ?? "APPROVED",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// -------------------------
// PROFILE → ROW INSERT MAPPER
// -------------------------
export function profileToRow(profile: {
  firebaseUid: string;
  email: string;
  fullName: string;
  role: string;
  program?: string | null;
  yearLevel?: string | null;
  school?: string | null;
  phone?: string | null;
  groupId?: string | null;
  adviserFirebaseUid?: string | null;
  isDeleted?: boolean;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  createdBy?: string | null;
}) {
  return {
    firebase_uid: profile.firebaseUid,
    email: profile.email,
    full_name: profile.fullName,
    role: profile.role,
    program: profile.program ?? null,
    year_level: profile.yearLevel ?? null,
    school: profile.school ?? null,
    phone: profile.phone ?? null,
    group_id: profile.groupId ?? null,
    adviser_firebase_uid: profile.adviserFirebaseUid ?? null,
    is_deleted: profile.isDeleted ?? false,
    status: profile.status ?? "APPROVED",
    created_by: profile.createdBy ?? null,
  };
}

// -------------------------
// AUDIT HELPER
// -------------------------
export async function logAudit(
  firebaseUid: string | null,
  actionType: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> {
  await getSupabase().from("audit_logs").insert({
    firebase_uid: firebaseUid,
    action_type: actionType,
    resource_type: resourceType ?? null,
    resource_id: resourceId ?? null,
    metadata: metadata ?? null,
    ip_address: ipAddress ?? null,
  });
}
