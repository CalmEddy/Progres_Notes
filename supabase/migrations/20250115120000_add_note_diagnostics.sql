-- Migration: Add diagnostics JSONB column to notes table
alter table notes
  add column if not exists diagnostics jsonb;
