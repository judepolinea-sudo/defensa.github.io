// One-off maintenance script: permanently remove a user account from both
// Supabase (the `users` record + account-management artifacts) and Firebase
// Authentication.
//
// Usage:
//   node scripts/remove-user.mjs <email>            # dry run — shows what it WOULD delete
//   node scripts/remove-user.mjs <email> --yes      # actually delete
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// FIREBASE_SERVICE_ACCOUNT from .env (never prints them).

import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import admin from "firebase-admin";

const email = (process.argv[2] || "").trim();
const commit = process.argv.includes("--yes");

if (!email) {
  console.error("Usage: node scripts/remove-user.mjs <email> [--yes]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const rawSa = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim().replace(/^['"]|['"]$/g, "");
if (!rawSa) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT in .env");
  process.exit(1);
}
const serviceAccount = JSON.parse(rawSa);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const auth = admin.auth();

console.log(`\nTarget: ${email}`);
console.log(commit ? "Mode:   DELETE (--yes)\n" : "Mode:   DRY RUN (pass --yes to delete)\n");

// ---- 1. Supabase users row ------------------------------------------------
const { data: users, error: uErr } = await supabase
  .from("users")
  .select("id, firebase_uid, email, full_name, role, is_deleted, created_by")
  .ilike("email", email);
if (uErr) throw uErr;

if (!users || users.length === 0) {
  console.log("Supabase users:  no matching row");
} else {
  for (const u of users) {
    console.log(
      `Supabase users:  ${u.email} | role=${u.role} | is_deleted=${u.is_deleted} | firebase_uid=${u.firebase_uid} | created_by=${u.created_by}`,
    );
  }
}
const firebaseUids = (users || []).map((u) => u.firebase_uid).filter(Boolean);

// ---- 2. Account-management artifacts ------------------------------------
const { count: prCount } = await supabase
  .from("password_reset_requests")
  .select("id", { count: "exact", head: true })
  .ilike("email", email);
console.log(`password_reset_requests: ${prCount ?? 0} row(s)`);

let regCount = 0;
{
  const { count } = await supabase
    .from("registration_requests")
    .select("id", { count: "exact", head: true })
    .ilike("email", email);
  regCount = count ?? 0;
}
console.log(`registration_requests:   ${regCount} row(s)`);

// ---- 3. Firebase Auth account ------------------------------------------
let fbUser = null;
try {
  fbUser = await auth.getUserByEmail(email);
  console.log(`Firebase Auth:   uid=${fbUser.uid} | providers=${fbUser.providerData.map((p) => p.providerId).join(",") || "password"}`);
} catch (e) {
  if (e.code === "auth/user-not-found") console.log("Firebase Auth:   no matching account");
  else throw e;
}

if (!commit) {
  console.log("\nDry run complete. Re-run with --yes to permanently delete the above.");
  process.exit(0);
}

// ---- EXECUTE ----------------------------------------------------------
console.log("\nDeleting...");

if (users && users.length > 0) {
  const { error } = await supabase.from("users").delete().ilike("email", email);
  if (error) throw error;
  console.log(`  ✓ removed ${users.length} row(s) from users`);
}

if ((prCount ?? 0) > 0) {
  await supabase.from("password_reset_requests").delete().ilike("email", email);
  console.log(`  ✓ removed password_reset_requests`);
}
if (regCount > 0) {
  await supabase.from("registration_requests").delete().ilike("email", email);
  console.log(`  ✓ removed registration_requests`);
}

// Clear presence columns are on the users row itself — already gone.

if (fbUser) {
  await auth.deleteUser(fbUser.uid);
  console.log(`  ✓ deleted Firebase Auth account ${fbUser.uid}`);
}

// Best-effort audit trail for the deletion.
try {
  await supabase.from("audit_logs").insert({
    actor_firebase_uid: "SCRIPT_REMOVE_USER",
    action: "HARD_DELETE_USER",
    entity_type: "users",
    entity_id: firebaseUids[0] ?? email,
    metadata: { email },
  });
} catch {
  /* audit_logs shape may differ — non-fatal */
}

console.log("\nDone.");
process.exit(0);
