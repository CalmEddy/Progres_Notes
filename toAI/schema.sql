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

-- Create composite indexes for date filtering
create index if not exists notes_user_created_idx on notes(user_id, created_at);
create index if not exists notes_user_updated_idx on notes(user_id, updated_at);

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
    and 1 - (n.embedding <=> query_embedding) >= match_threshold
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
  add column if not exists parent_note_id uuid references notes(id) on delete cascade,
  add column if not exists conversation_id uuid references notes(id) on delete set null,
  add column if not exists is_conversation boolean default false not null;

-- Create index on folder_id for faster queries
create index if not exists notes_folder_id_idx on notes(folder_id);

-- Create index on parent_note_id for faster queries
create index if not exists notes_parent_note_id_idx on notes(parent_note_id);

-- Add full-text search column for notes
alter table notes add column if not exists search_vector tsvector;

-- Create GIN index for full-text search
create index if not exists notes_fts_idx on notes using gin(search_vector);

-- Function to update search_vector
create or replace function notes_search_vector_update()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'B');
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update search_vector
drop trigger if exists notes_search_vector_update_trigger on notes;
create trigger notes_search_vector_update_trigger
  before insert or update on notes
  for each row
  execute function notes_search_vector_update();

-- Backfill search_vector for existing notes
update notes set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(body, '')), 'B')
where search_vector is null;

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

-- Create tags table for user-created tags
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text, -- optional hex color code
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tags_user_name_unique unique (user_id, name)
);

-- Create index on user_id for faster queries
create index if not exists tags_user_id_idx on tags(user_id);

-- Create index on name for faster searches
create index if not exists tags_name_idx on tags(name);

-- Create trigger to update updated_at for tags
drop trigger if exists update_tags_updated_at on tags;
create trigger update_tags_updated_at
  before update on tags
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for tags
alter table tags enable row level security;

-- Policy: Users can select only their own tags
drop policy if exists "Users can view own tags" on tags;
create policy "Users can view own tags"
  on tags
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own tags" on tags;
create policy "Users can insert own tags"
  on tags
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own tags
drop policy if exists "Users can update own tags" on tags;
create policy "Users can update own tags"
  on tags
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own tags
drop policy if exists "Users can delete own tags" on tags;
create policy "Users can delete own tags"
  on tags
  for delete
  using (auth.uid() = user_id);

-- Create note_tags junction table (links notes to tags)
create table if not exists note_tags (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  tag_id uuid references tags(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint note_tags_unique unique (note_id, tag_id)
);

-- Create index on note_id for faster queries
create index if not exists note_tags_note_id_idx on note_tags(note_id);

-- Create index on tag_id for faster queries
create index if not exists note_tags_tag_id_idx on note_tags(tag_id);

-- Enable Row-Level Security for note_tags
alter table note_tags enable row level security;

-- Policy: Users can select note-tag links for their own notes
drop policy if exists "Users can view own note tags" on note_tags;
create policy "Users can view own note tags"
  on note_tags
  for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can insert note-tag links for their own notes
drop policy if exists "Users can insert own note tags" on note_tags;
create policy "Users can insert own note tags"
  on note_tags
  for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
        and notes.user_id = auth.uid()
    )
    and exists (
      select 1 from tags
      where tags.id = note_tags.tag_id
        and tags.user_id = auth.uid()
    )
  );

-- Policy: Users can delete note-tag links for their own notes
drop policy if exists "Users can delete own note tags" on note_tags;
create policy "Users can delete own note tags"
  on note_tags
  for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_tags.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Create filter_folders table for saved filter definitions
create table if not exists filter_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  filter_conditions jsonb not null, -- array of filter condition objects
  position integer default 0 not null,
  parent_id uuid references folders(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create index on user_id for faster queries
create index if not exists filter_folders_user_id_idx on filter_folders(user_id);

-- Create index on parent_id for faster queries
create index if not exists filter_folders_parent_id_idx on filter_folders(parent_id);

-- Create trigger to update updated_at for filter_folders
drop trigger if exists update_filter_folders_updated_at on filter_folders;
create trigger update_filter_folders_updated_at
  before update on filter_folders
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for filter_folders
alter table filter_folders enable row level security;

-- Policy: Users can select only their own filter folders
drop policy if exists "Users can view own filter folders" on filter_folders;
create policy "Users can view own filter folders"
  on filter_folders
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own filter folders" on filter_folders;
create policy "Users can insert own filter folders"
  on filter_folders
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own filter folders
drop policy if exists "Users can update own filter folders" on filter_folders;
create policy "Users can update own filter folders"
  on filter_folders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own filter folders
drop policy if exists "Users can delete own filter folders" on filter_folders;
create policy "Users can delete own filter folders"
  on filter_folders
  for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Schema Extensions: Chunking, Themes, and Enhanced Tagging
-- ============================================================================

-- Create note_chunks table for paragraph-based chunks
create table if not exists note_chunks (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  chunk_text text not null,
  chunk_index integer not null,  -- 0-based position in note
  embedding vector(1536),  -- text-embedding-3-small
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint note_chunks_note_index_unique unique (note_id, chunk_index)
);

-- Create index on note_id for faster queries
create index if not exists note_chunks_note_id_idx on note_chunks(note_id);

-- Create HNSW index on embedding for vector similarity search
create index if not exists note_chunks_embedding_idx on note_chunks using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- Create composite index for efficient re-chunking operations
create index if not exists note_chunks_note_index_idx on note_chunks(note_id, chunk_index);

-- Create trigger to update updated_at for note_chunks
drop trigger if exists update_note_chunks_updated_at on note_chunks;
create trigger update_note_chunks_updated_at
  before update on note_chunks
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for note_chunks
alter table note_chunks enable row level security;

-- Policy: Users can select only chunks for their own notes
drop policy if exists "Users can view own chunks" on note_chunks;
create policy "Users can view own chunks"
  on note_chunks
  for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_chunks.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can insert chunks only for their own notes
drop policy if exists "Users can insert own chunks" on note_chunks;
create policy "Users can insert own chunks"
  on note_chunks
  for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_chunks.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can update chunks only for their own notes
drop policy if exists "Users can update own chunks" on note_chunks;
create policy "Users can update own chunks"
  on note_chunks
  for update
  using (
    exists (
      select 1 from notes
      where notes.id = note_chunks.note_id
        and notes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from notes
      where notes.id = note_chunks.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can delete chunks only for their own notes
drop policy if exists "Users can delete own chunks" on note_chunks;
create policy "Users can delete own chunks"
  on note_chunks
  for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_chunks.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Create note_themes table for single theme per note
create table if not exists note_themes (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade not null,
  theme_label text,  -- User-modifiable label (nullable for auto-generated)
  centroid_embedding vector(1536),  -- Theme centroid
  is_user_modified boolean default false not null,  -- True if user edited
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint note_themes_note_unique unique (note_id)  -- One theme per note
);

-- Create index on note_id for faster queries
create index if not exists note_themes_note_id_idx on note_themes(note_id);

-- Create HNSW index on centroid_embedding for theme similarity search
create index if not exists note_themes_centroid_embedding_idx on note_themes using hnsw (centroid_embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- Create trigger to update updated_at for note_themes
drop trigger if exists update_note_themes_updated_at on note_themes;
create trigger update_note_themes_updated_at
  before update on note_themes
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for note_themes
alter table note_themes enable row level security;

-- Policy: Users can select only themes for their own notes
drop policy if exists "Users can view own themes" on note_themes;
create policy "Users can view own themes"
  on note_themes
  for select
  using (
    exists (
      select 1 from notes
      where notes.id = note_themes.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can insert themes only for their own notes
drop policy if exists "Users can insert own themes" on note_themes;
create policy "Users can insert own themes"
  on note_themes
  for insert
  with check (
    exists (
      select 1 from notes
      where notes.id = note_themes.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can update themes only for their own notes
drop policy if exists "Users can update own themes" on note_themes;
create policy "Users can update own themes"
  on note_themes
  for update
  using (
    exists (
      select 1 from notes
      where notes.id = note_themes.note_id
        and notes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from notes
      where notes.id = note_themes.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Policy: Users can delete themes only for their own notes
drop policy if exists "Users can delete own themes" on note_themes;
create policy "Users can delete own themes"
  on note_themes
  for delete
  using (
    exists (
      select 1 from notes
      where notes.id = note_themes.note_id
        and notes.user_id = auth.uid()
    )
  );

-- Create chunk_theme_assignments table
create table if not exists chunk_theme_assignments (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid references note_chunks(id) on delete cascade not null,
  theme_id uuid references note_themes(id) on delete cascade not null,
  similarity_score float not null,  -- Cosine similarity to theme centroid
  created_at timestamp with time zone default now() not null,
  constraint chunk_theme_assignments_chunk_unique unique (chunk_id)  -- One theme per chunk
);

-- Create index on chunk_id for faster queries
create index if not exists chunk_theme_assignments_chunk_id_idx on chunk_theme_assignments(chunk_id);

-- Create index on theme_id for theme-to-chunks lookups
create index if not exists chunk_theme_assignments_theme_id_idx on chunk_theme_assignments(theme_id);

-- Enable Row-Level Security for chunk_theme_assignments
alter table chunk_theme_assignments enable row level security;

-- Policy: Users can select assignments for their own chunks
drop policy if exists "Users can view own chunk theme assignments" on chunk_theme_assignments;
create policy "Users can view own chunk theme assignments"
  on chunk_theme_assignments
  for select
  using (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_theme_assignments.chunk_id
        and n.user_id = auth.uid()
    )
  );

-- Policy: Users can insert assignments for their own chunks
drop policy if exists "Users can insert own chunk theme assignments" on chunk_theme_assignments;
create policy "Users can insert own chunk theme assignments"
  on chunk_theme_assignments
  for insert
  with check (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_theme_assignments.chunk_id
        and n.user_id = auth.uid()
    )
    and exists (
      select 1 from note_themes nt
      join notes n on nt.note_id = n.id
      where nt.id = chunk_theme_assignments.theme_id
        and n.user_id = auth.uid()
    )
  );

-- Policy: Users can update assignments for their own chunks
drop policy if exists "Users can update own chunk theme assignments" on chunk_theme_assignments;
create policy "Users can update own chunk theme assignments"
  on chunk_theme_assignments
  for update
  using (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_theme_assignments.chunk_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_theme_assignments.chunk_id
        and n.user_id = auth.uid()
    )
  );

-- Policy: Users can delete assignments for their own chunks
drop policy if exists "Users can delete own chunk theme assignments" on chunk_theme_assignments;
create policy "Users can delete own chunk theme assignments"
  on chunk_theme_assignments
  for delete
  using (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_theme_assignments.chunk_id
        and n.user_id = auth.uid()
    )
  );

-- Create chunk_tags junction table for chunk-level tagging
create table if not exists chunk_tags (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid references note_chunks(id) on delete cascade not null,
  tag_id uuid references tags(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint chunk_tags_unique unique (chunk_id, tag_id)
);

-- Create index on chunk_id for faster queries
create index if not exists chunk_tags_chunk_id_idx on chunk_tags(chunk_id);

-- Create index on tag_id for faster queries
create index if not exists chunk_tags_tag_id_idx on chunk_tags(tag_id);

-- Enable Row-Level Security for chunk_tags
alter table chunk_tags enable row level security;

-- Policy: Users can select chunk-tag links for their own chunks
drop policy if exists "Users can view own chunk tags" on chunk_tags;
create policy "Users can view own chunk tags"
  on chunk_tags
  for select
  using (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_tags.chunk_id
        and n.user_id = auth.uid()
    )
  );

-- Policy: Users can insert chunk-tag links for their own chunks
drop policy if exists "Users can insert own chunk tags" on chunk_tags;
create policy "Users can insert own chunk tags"
  on chunk_tags
  for insert
  with check (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_tags.chunk_id
        and n.user_id = auth.uid()
    )
    and exists (
      select 1 from tags
      where tags.id = chunk_tags.tag_id
        and tags.user_id = auth.uid()
    )
  );

-- Policy: Users can delete chunk-tag links for their own chunks
drop policy if exists "Users can delete own chunk tags" on chunk_tags;
create policy "Users can delete own chunk tags"
  on chunk_tags
  for delete
  using (
    exists (
      select 1 from note_chunks nc
      join notes n on nc.note_id = n.id
      where nc.id = chunk_tags.chunk_id
        and n.user_id = auth.uid()
    )
  );

-- Function for similarity search within a note's chunks
-- This function finds chunks in a specific note similar to a query embedding
create or replace function match_chunks_in_note(
  p_note_id uuid,
  p_query_embedding vector(1536),
  p_match_threshold float default 0.7,
  p_limit int default 10
)
returns table (
  id uuid,
  note_id uuid,
  chunk_text text,
  chunk_index integer,
  embedding vector(1536),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity float
)
language sql stable
as $$
  select
    nc.id,
    nc.note_id,
    nc.chunk_text,
    nc.chunk_index,
    nc.embedding,
    nc.created_at,
    nc.updated_at,
    1 - (nc.embedding <=> p_query_embedding) as similarity
  from note_chunks nc
  join notes n on nc.note_id = n.id
  where nc.note_id = p_note_id
    and nc.embedding is not null
    and n.user_id = auth.uid()
    and 1 - (nc.embedding <=> p_query_embedding) >= p_match_threshold
  order by nc.embedding <=> p_query_embedding
  limit p_limit;
$$;

-- Function to search notes by theme similarity
-- This function finds notes with themes similar to a query embedding
create or replace function search_notes_by_theme(
  p_query_embedding vector(1536),
  p_theme_threshold float default 0.7,
  p_limit int default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  folder_id uuid,
  parent_note_id uuid,
  "position" integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  theme_label text,
  theme_similarity float
)
language sql stable
as $$
  select
    n.id,
    n.user_id,
    n.title,
    n.body,
    n.folder_id,
    n.parent_note_id,
    n."position",
    n.created_at,
    n.updated_at,
    nt.theme_label,
    1 - (nt.centroid_embedding <=> p_query_embedding) as theme_similarity
  from notes n
  inner join note_themes nt on n.id = nt.note_id
  where n.user_id = auth.uid()
    and nt.centroid_embedding is not null
    and 1 - (nt.centroid_embedding <=> p_query_embedding) >= p_theme_threshold
  order by nt.centroid_embedding <=> p_query_embedding
  limit p_limit;
$$;

-- Function to search chunks across all user notes and aggregate by note
-- Returns notes that contain matching chunks, ranked by best chunk similarity
-- This provides more precise semantic search than note-level embeddings
-- Drop the function first if it exists (needed when changing return type)
drop function if exists match_chunks_across_notes(vector, double precision, integer);

create or replace function match_chunks_across_notes(
  p_query_embedding vector(1536),
  p_match_threshold float default 0.7,
  p_limit int default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  folder_id uuid,
  parent_note_id uuid,
  "position" integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  best_chunk_similarity float,
  matching_chunks_count int,
  chunk_ids uuid[],
  best_chunk_text text
)
language sql stable
as $$
  with matching_chunks as (
    select
      nc.note_id,
      nc.id as chunk_id,
      nc.chunk_text,
      1 - (nc.embedding <=> p_query_embedding) as similarity
    from note_chunks nc
    join notes n on nc.note_id = n.id
    where nc.embedding is not null
      and n.user_id = auth.uid()
      and 1 - (nc.embedding <=> p_query_embedding) >= p_match_threshold
  ),
  note_aggregates as (
    select
      mc.note_id,
      max(mc.similarity) as best_chunk_similarity,
      count(*) as matching_chunks_count,
      array_agg(mc.chunk_id) as chunk_ids,
      -- Get the chunk text from the chunk with the best similarity
      (array_agg(mc.chunk_text order by mc.similarity desc))[1] as best_chunk_text
    from matching_chunks mc
    group by mc.note_id
  )
  select
    n.id,
    n.user_id,
    n.title,
    n.body,
    n.folder_id,
    n.parent_note_id,
    n.position,
    n.created_at,
    n.updated_at,
    na.best_chunk_similarity,
    na.matching_chunks_count,
    na.chunk_ids,
    na.best_chunk_text
  from note_aggregates na
  join notes n on na.note_id = n.id
  order by na.best_chunk_similarity desc, na.matching_chunks_count desc
  limit p_limit;
$$;

-- Function for full-text search on notes
-- Uses PostgreSQL full-text search with ts_rank for relevance scoring
create or replace function search_notes_fts(
  p_user_id uuid,
  p_query text,
  p_limit int default 20
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  folder_id uuid,
  parent_note_id uuid,
  "position" integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  relevance float,
  matched_fields text[]
)
language plpgsql stable
as $$
declare
  v_tsquery tsquery;
begin
  -- Convert input query to tsquery format
  -- Handle both plain text and already formatted queries
  begin
    v_tsquery := to_tsquery('english', p_query);
  exception when others then
    -- If query parsing fails, try plainto_tsquery (more forgiving)
    v_tsquery := plainto_tsquery('english', p_query);
  end;

  -- Perform full-text search with ranking
  return query
    select
      n.id,
      n.user_id,
      n.title,
      n.body,
      n.folder_id,
      n.parent_note_id,
      n."position",
      n.created_at,
      n.updated_at,
      ts_rank(n.search_vector, v_tsquery) as relevance,
      case
        when to_tsvector('english', coalesce(n.title, '')) @@ v_tsquery then array['title']
        when to_tsvector('english', coalesce(n.body, '')) @@ v_tsquery then array['body']
        else array['title', 'body']
      end as matched_fields
    from notes n
    where n.user_id = p_user_id
      and n.search_vector @@ v_tsquery
    order by relevance desc, n.updated_at desc
    limit p_limit;
end;
$$;

-- Function to filter notes based on multiple conditions
-- This function combines all filter conditions into a single efficient query
-- Conditions are applied in optimal order: embedding -> tags -> dates -> keyword/text
-- Note: Relative dates should be pre-parsed in application code before calling this function
create or replace function filter_notes_for_user(
  p_filter_conditions jsonb,
  p_query_embedding vector(1536) default null,
  p_embedding_threshold float default 0.15
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  folder_id uuid,
  parent_note_id uuid,
  "position" integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tags jsonb
)
language plpgsql stable
as $$
declare
  v_sql text;
  v_where_parts text[] := array[]::text[];
  v_joins text[] := array[]::text[];
  v_condition jsonb;
  v_condition_type text;
  v_condition_operator text;
  v_tag_ids uuid[];
  v_date_field text;
  v_date_start timestamp with time zone;
  v_date_end timestamp with time zone;
  v_keyword_value text;
  v_text_pattern text;
  v_has_embedding boolean := false;
begin
  -- Start building the query with embedding filter if present (most selective)
  if p_query_embedding is not null then
    -- Check if there's an embedding condition
    for v_condition in select * from jsonb_array_elements(p_filter_conditions)
    loop
      if (v_condition->>'type') = 'embedding' then
        v_has_embedding := true;
        exit;
      end if;
    end loop;
    
    if v_has_embedding then
      -- Use match_notes to get embedding matches first
      -- Use $1 placeholder for vector parameter (will be substituted via USING)
      v_sql := '
        with embedding_matches as (
          select id
          from match_notes($1, ' || p_embedding_threshold || ', 1000)
        ),
        filtered_by_embedding as (
          select n.*
          from notes n
          inner join embedding_matches em on n.id = em.id
          where n.user_id = auth.uid()
      ';
    else
      v_sql := '
        with filtered_by_embedding as (
          select n.*
          from notes n
          where n.user_id = auth.uid()
      ';
    end if;
  else
    v_sql := '
      with filtered_by_embedding as (
        select n.*
        from notes n
        where n.user_id = auth.uid()
    ';
  end if;

  -- Complete the filtered_by_embedding CTE
  v_sql := v_sql || '
      ),
      base_notes as (
        select fn.*
        from filtered_by_embedding fn
  ';

  -- Process each condition (except embedding which is already handled)
  for v_condition in select * from jsonb_array_elements(p_filter_conditions)
  loop
    v_condition_type := v_condition->>'type';
    v_condition_operator := v_condition->>'operator';

    -- Skip embedding (already handled above)
    if v_condition_type = 'embedding' then
      continue;
    end if;

    -- Tag filter
    if v_condition_type = 'tag' then
      v_tag_ids := array(select jsonb_array_elements_text(v_condition->'tagIds'))::uuid[];
      
      if v_condition_operator = 'equals' and array_length(v_tag_ids, 1) = 1 then
        v_joins := array_append(v_joins, 
          'inner join note_tags nt' || array_length(v_joins, 1) || ' on fn.id = nt' || array_length(v_joins, 1) || '.note_id and nt' || array_length(v_joins, 1) || '.tag_id = ' || quote_literal(v_tag_ids[1]::text)
        );
      elsif v_condition_operator = 'in' and array_length(v_tag_ids, 1) > 0 then
        v_joins := array_append(v_joins,
          'inner join note_tags nt' || array_length(v_joins, 1) || ' on fn.id = nt' || array_length(v_joins, 1) || '.note_id and nt' || array_length(v_joins, 1) || '.tag_id = any(ARRAY[' || array_to_string(array(select quote_literal(t::text) from unnest(v_tag_ids) t), ',') || ']::uuid[])'
        );
      end if;
    end if;

    -- Date filters
    if v_condition_type in ('date_created', 'date_modified') then
      v_date_field := case when v_condition_type = 'date_created' then 'created_at' else 'updated_at' end;
      
      if v_condition_operator = 'equals' and v_condition->>'value' is not null then
        v_date_start := (v_condition->>'value')::timestamp with time zone;
        v_date_start := date_trunc('day', v_date_start);
        v_date_end := v_date_start + interval '1 day' - interval '1 second';
        v_where_parts := array_append(v_where_parts, 
          'fn.' || v_date_field || ' >= ' || quote_literal(v_date_start::text) || 
          ' and fn.' || v_date_field || ' <= ' || quote_literal(v_date_end::text)
        );
      elsif v_condition_operator = 'range' and v_condition->>'startDate' is not null and v_condition->>'endDate' is not null then
        v_date_start := (v_condition->>'startDate')::timestamp with time zone;
        v_date_start := date_trunc('day', v_date_start);
        v_date_end := (v_condition->>'endDate')::timestamp with time zone;
        v_date_end := date_trunc('day', v_date_end) + interval '1 day' - interval '1 second';
        v_where_parts := array_append(v_where_parts,
          'fn.' || v_date_field || ' >= ' || quote_literal(v_date_start::text) ||
          ' and fn.' || v_date_field || ' <= ' || quote_literal(v_date_end::text)
        );
      end if;
    end if;

    -- Keyword filter
    if v_condition_type = 'keyword' and v_condition->>'value' is not null then
      v_keyword_value := lower(v_condition->>'value');
      if v_condition_operator = 'contains' then
        v_where_parts := array_append(v_where_parts,
          '(lower(coalesce(fn.title, '''')) || '' '' || lower(fn.body) like ' || quote_literal('%' || replace(v_keyword_value, '''', '''''') || '%') || ')'
        );
      elsif v_condition_operator = 'not_contains' then
        v_where_parts := array_append(v_where_parts,
          '(lower(coalesce(fn.title, '''')) || '' '' || lower(fn.body) not like ' || quote_literal('%' || replace(v_keyword_value, '''', '''''') || '%') || ')'
        );
      end if;
    end if;

    -- Text pattern filter
    if v_condition_type = 'text_pattern' and v_condition->>'pattern' is not null then
      v_text_pattern := v_condition->>'pattern';
      v_where_parts := array_append(v_where_parts,
        '(coalesce(fn.title, '''') || ''\n'' || fn.body like ' || quote_literal('%' || replace(v_text_pattern, '''', '''''') || '%') || ')'
      );
    end if;
  end loop;

  -- Complete the base_notes CTE
  if array_length(v_joins, 1) > 0 then
    v_sql := v_sql || '
      ' || array_to_string(v_joins, '
      ');
  end if;
  
  if array_length(v_where_parts, 1) > 0 then
    v_sql := v_sql || '
      where ' || array_to_string(v_where_parts, ' and ');
  end if;

  v_sql := v_sql || '
      )
      select 
        bn.id,
        bn.user_id,
        bn.title,
        bn.body,
        bn.folder_id,
        bn.parent_note_id,
        bn.position as "position",
        bn.created_at,
        bn.updated_at,
        coalesce(
          jsonb_agg(
            distinct jsonb_build_object(
              ''id'', t.id,
              ''name'', t.name,
              ''color'', t.color
            )
          ) filter (where t.id is not null),
          ''[]''::jsonb
        ) as tags
      from base_notes bn
      left join note_tags nt_final on bn.id = nt_final.note_id
      left join tags t on nt_final.tag_id = t.id and t.user_id = auth.uid()
      group by bn.id, bn.user_id, bn.title, bn.body, bn.folder_id, bn.parent_note_id, bn.position, bn.created_at, bn.updated_at
      order by bn.created_at desc
  ';

  -- Execute the query with proper parameter handling
  if v_has_embedding and p_query_embedding is not null then
    -- Use USING clause to pass vector parameter
    return query execute v_sql using p_query_embedding;
  else
    -- No vector parameter needed
    return query execute v_sql;
  end if;
end;
$$;

-- ============================================================================
-- Schema Extensions: Conversations
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

-- Create index on conversation_id in notes table for faster queries
create index if not exists notes_conversation_id_idx on notes(conversation_id);

-- Create index on is_conversation flag for filtering
create index if not exists notes_is_conversation_idx on notes(is_conversation);

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

