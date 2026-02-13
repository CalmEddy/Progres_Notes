-- Migration: Remove diagnostics JSONB column from notes table
alter table notes
  drop column if exists diagnostics;

