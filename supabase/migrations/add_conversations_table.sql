-- Migration: Create conversations table for storing individual chat messages
-- This migration creates the conversations table and sets up RLS policies

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

