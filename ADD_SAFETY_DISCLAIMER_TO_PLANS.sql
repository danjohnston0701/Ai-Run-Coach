-- Migration: Add safety_disclaimer column to training_plans
-- 
-- Stores the AI-generated safety/medical disclaimer produced when a plan is
-- created for an athlete with active or recovering injuries.
--
-- Format: JSON string with shape:
-- {
--   "medicalClearanceRequired": boolean,
--   "prerequisiteChecks": string[],
--   "stopCriteria": string[],
--   "progressionGates": string[],
--   "disclaimer": string   -- plain-language paragraph shown to the athlete
-- }
--
-- Run this once against the Neon production database.

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS safety_disclaimer TEXT;
