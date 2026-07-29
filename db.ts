/**
 * DEPRECATED — this file previously managed the MySQL connection pool.
 *
 * The Defensa platform has been migrated to Supabase PostgreSQL.
 * All database access now goes through lib/supabaseAdmin.ts (service role)
 * using the @supabase/supabase-js client.
 *
 * This file is intentionally left as a stub to preserve any accidental
 * import references and produce a clear error message rather than a
 * module-not-found crash.
 */

export function getPool(): never {
  throw new Error(
    "[db.ts] MySQL pool is no longer available. " +
    "Import { supabase } from './lib/supabaseAdmin.ts' instead.",
  );
}
