-- Create comedy_base_premises table
create table if not exists comedy_base_premises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  note_id uuid references notes(id) on delete cascade not null,
  topic text not null,
  items jsonb not null,
  clean boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint comedy_base_premises_note_id_unique unique (note_id)
);

-- Create indexes for comedy_base_premises
create index if not exists comedy_base_premises_user_id_idx on comedy_base_premises(user_id);
create index if not exists comedy_base_premises_note_id_idx on comedy_base_premises(note_id);

-- Create trigger to update updated_at for comedy_base_premises
drop trigger if exists update_comedy_base_premises_updated_at on comedy_base_premises;
create trigger update_comedy_base_premises_updated_at
  before update on comedy_base_premises
  for each row
  execute function update_updated_at_column();

-- Enable Row-Level Security for comedy_base_premises
alter table comedy_base_premises enable row level security;

-- Policy: Users can select only their own base premises
drop policy if exists "Users can view own base premises" on comedy_base_premises;
create policy "Users can view own base premises"
  on comedy_base_premises
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert only with their own user_id
drop policy if exists "Users can insert own base premises" on comedy_base_premises;
create policy "Users can insert own base premises"
  on comedy_base_premises
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update only their own base premises
drop policy if exists "Users can update own base premises" on comedy_base_premises;
create policy "Users can update own base premises"
  on comedy_base_premises
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy: Users can delete only their own base premises
drop policy if exists "Users can delete own base premises" on comedy_base_premises;
create policy "Users can delete own base premises"
  on comedy_base_premises
  for delete
  using (auth.uid() = user_id);

-- Add source_base_premise_note_id to notes table
alter table notes
  add column if not exists source_base_premise_note_id uuid references notes(id) on delete set null;

-- Add style_contract_id to notes table
alter table notes
  add column if not exists style_contract_id text;

-- Create index on source_base_premise_note_id for efficient lookups
create index if not exists notes_source_base_premise_note_id_idx on notes(source_base_premise_note_id);

-- Create index on style_contract_id for filtering
create index if not exists notes_style_contract_id_idx on notes(style_contract_id);

