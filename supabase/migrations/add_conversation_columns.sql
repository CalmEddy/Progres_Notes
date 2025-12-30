-- Migration: Add conversation columns to notes table
-- This migration adds conversation_id and is_conversation columns to support chat functionality

-- Add conversation_id column (nullable, self-referencing for conversation grouping)
alter table notes 
  add column if not exists conversation_id uuid references notes(id) on delete set null;

-- Add is_conversation boolean flag
alter table notes 
  add column if not exists is_conversation boolean default false not null;

-- Create index on conversation_id for faster queries
create index if not exists notes_conversation_id_idx on notes(conversation_id);

-- Create index on is_conversation flag for filtering
create index if not exists notes_is_conversation_idx on notes(is_conversation);

