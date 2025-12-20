-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Create notes table
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  body text not null,
  embedding vector(1536), -- text-embedding-3-small produces 1536-dimensional vectors
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create index on user_id for faster queries
create index if not exists notes_user_id_idx on notes(user_id);

-- Create index on embedding for vector similarity search
create index if not exists notes_embedding_idx on notes using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Create function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to call the update function
drop trigger if exists update_notes_updated_at on notes;
create trigger update_notes_updated_at
  before update on notes
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security
alter table notes enable row level security;

-- Policy: Users can select only their own notes
drop policy if exists "Users can view own notes" on notes;
create policy "Users can view own notes"
  on notes
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own notes" on notes;
create policy "Users can insert own notes"
  on notes
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own notes
drop policy if exists "Users can update own notes" on notes;
create policy "Users can update own notes"
  on notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own notes
drop policy if exists "Users can delete own notes" on notes;
create policy "Users can delete own notes"
  on notes
  for delete
  using (auth.uid() = user_id);

-- Function for similarity search using pgvector
-- This function finds notes similar to a query embedding
create or replace function match_notes(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  similarity float
)
language sql stable
as $$
  select
    n.id,
    n.user_id,
    n.title,
    n.body,
    1 - (n.embedding <=> query_embedding) as similarity
  from notes n
  where n.embedding is not null
    and n.user_id = auth.uid()
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

-- Create phrases table (stores unique phrases per user)
create table if not exists phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  phrase_text text not null,
  category text not null,
  pos_pattern text,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  constraint phrases_user_text_unique unique (user_id, phrase_text)
);

-- Create index on user_id for faster queries
create index if not exists phrases_user_id_idx on phrases(user_id);

-- Create index on category for filtering by category
create index if not exists phrases_category_idx on phrases(category);

-- Create index on phrase_text for text searches
create index if not exists phrases_text_idx on phrases(phrase_text);

-- Enable Row-Level Security for phrases
alter table phrases enable row level security;

-- Policy: Users can select only their own phrases
drop policy if exists "Users can view own phrases" on phrases;
create policy "Users can view own phrases"
  on phrases
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own phrases" on phrases;
create policy "Users can insert own phrases"
  on phrases
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own phrases
drop policy if exists "Users can update own phrases" on phrases;
create policy "Users can update own phrases"
  on phrases
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own phrases
drop policy if exists "Users can delete own phrases" on phrases;
create policy "Users can delete own phrases"
  on phrases
  for delete
  using (auth.uid() = user_id);

-- Create folders table for organizing notes
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  parent_id uuid references folders(id) on delete cascade,
  position integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create index on user_id for faster queries
create index if not exists folders_user_id_idx on folders(user_id);

-- Create index on parent_id for faster queries
create index if not exists folders_parent_id_idx on folders(parent_id);

-- Create trigger to update updated_at for folders
drop trigger if exists update_folders_updated_at on folders;
create trigger update_folders_updated_at
  before update on folders
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for folders
alter table folders enable row level security;

-- Policy: Users can select only their own folders
drop policy if exists "Users can view own folders" on folders;
create policy "Users can view own folders"
  on folders
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own folders" on folders;
create policy "Users can insert own folders"
  on folders
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own folders
drop policy if exists "Users can update own folders" on folders;
create policy "Users can update own folders"
  on folders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own folders
drop policy if exists "Users can delete own folders" on folders;
create policy "Users can delete own folders"
  on folders
  for delete
  using (auth.uid() = user_id);

-- Add folder_id, position, and parent_note_id columns to notes table
alter table notes 
  add column if not exists folder_id uuid references folders(id) on delete set null,
  add column if not exists position integer default 0 not null,
  add column if not exists parent_note_id uuid references notes(id) on delete cascade;

-- Create index on folder_id for faster queries
create index if not exists notes_folder_id_idx on notes(folder_id);

-- Create index on parent_note_id for faster queries
create index if not exists notes_parent_note_id_idx on notes(parent_note_id);

-- Create note_phrases junction table (links notes to phrases)
create table if not exists note_phrases (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  phrase_id uuid references phrases(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint note_phrases_unique unique (note_id, phrase_id)
);

-- Create index on note_id for faster queries
create index if not exists note_phrases_note_id_idx on note_phrases(note_id);

-- Create index on phrase_id for faster queries
create index if not exists note_phrases_phrase_id_idx on note_phrases(phrase_id);

-- Enable Row-Level Security for note_phrases
alter table note_phrases enable row level security;

-- Policy: Users can select note-phrase links for their own notes
drop policy if exists "Users can view own note phrases" on note_phrases;
create policy "Users can view own note phrases"
  on note_phrases
  for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_phrases.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can insert note-phrase links for their own notes
drop policy if exists "Users can insert own note phrases" on note_phrases;
create policy "Users can insert own note phrases"
  on note_phrases
  for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_phrases.note_id
        and notes.user_id = auth.uid()
    )
    and exists (
      select 1 from phrases
      where phrases.id = note_phrases.phrase_id
        and phrases.user_id = auth.uid()
    )
  );

-- Policy: Users can delete note-phrase links for their own notes
drop policy if exists "Users can delete own note phrases" on note_phrases;
create policy "Users can delete own note phrases"
  on note_phrases
  for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_phrases.note_id
        and notes.user_id = auth.uid()
    )
  );

