-- =============================================================================
-- DROP: pending_google_signups table
-- The email-confirmation-gate flow for Google sign-up was reverted — Google
-- sign-ins are back to immediate auto-provisioning (see verifyAndGetCaller
-- in server.ts). This table is no longer referenced anywhere.
-- =============================================================================

DROP TABLE IF EXISTS pending_google_signups CASCADE;
