-- =============================================================================
-- USERS.PROGRAM AS FREE TEXT
-- The user-provisioning and self-registration forms now let people type
-- their department/program directly instead of picking from a fixed
-- BSIT/BSCpE dropdown. Drop the CHECK constraint from 001_initial_schema.sql
-- that enforced the old fixed list.
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_program_check;
