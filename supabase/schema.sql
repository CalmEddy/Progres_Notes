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
create policy "Users can view own notes"
  on notes
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
create policy "Users can insert own notes"
  on notes
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own notes
create policy "Users can update own notes"
  on notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own notes
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

