-- Migration: Add full conversation support
-- This migration adds all necessary tables and columns for chat functionality
-- Run this migration to set up conversations support

-- ============================================================================
-- Step 1: Add columns to notes table
-- ============================================================================

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

-- ============================================================================
-- Step 2: Create conversations table
-- ============================================================================

-- Create conversations table for storing individual chat messages
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_note_id uuid references notes(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_index integer not null,
  created_at timestamp with time zone default now() not null,
  constraint conversations_note_index_unique unique (conversation_note_id, message_index)
);

-- Create index on conversation_note_id for faster queries
create index if not exists conversations_note_id_idx on conversations(conversation_note_id);

-- Create index on message_index for ordering
create index if not exists conversations_message_index_idx on conversations(conversation_note_id, message_index);

-- ============================================================================
-- Step 3: Set up Row-Level Security for conversations
-- ============================================================================

-- Enable Row-Level Security for conversations
alter table conversations enable row level security;

-- Policy: Users can select only conversations for their own notes
drop policy if exists "Users can view own conversations" on conversations;
create policy "Users can view own conversations"
  on conversations
  for select
  using (
    exists (
      select 1 from notes
      where notes.id = conversations.conversation_note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can insert conversations only for their own notes
drop policy if exists "Users can insert own conversations" on conversations;
create policy "Users can insert own conversations"
  on conversations
  for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = conversations.conversation_note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can update conversations only for their own notes
drop policy if exists "Users can update own conversations" on conversations;
create policy "Users can update own conversations"
  on conversations
  for update
  using (
    exists (
      select 1 from notes
      where notes.id = conversations.conversation_note_id
        and notes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from notes
      where notes.id = conversations.conversation_note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can delete conversations only for their own notes
drop policy if exists "Users can delete own conversations" on conversations;
create policy "Users can delete own conversations"
  on conversations
  for delete
  using (
    exists (
      select 1 from notes
      where notes.id = conversations.conversation_note_id
        and notes.user_id = auth.uid()
    )
  );

