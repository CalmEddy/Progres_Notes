# Development Notes

## PostgreSQL Reserved Keywords

### `position` Keyword Issue

**Problem**: `position` is a reserved keyword in PostgreSQL. When used in function return table definitions or SELECT statements, it must be quoted with double quotes.

**Error**: `ERROR: 42601: syntax error at or near "position"`

**Solution**: Always quote `position` when used in:
- Function return table definitions: `"position" integer`
- SELECT statements: `n."position"`
- Column aliases: `bn.position as "position"`

**Affected Functions**:
- `search_notes_by_theme` (line ~883)
- `search_notes_fts` (line ~994)
- `match_chunks_across_notes` (line ~927)
- `filter_notes_for_user` (line ~1222)

**Best Practice**: When creating new functions that return the `position` column, always quote it:
```sql
returns table (
  ...
  "position" integer,
  ...
)
```

And in SELECT statements:
```sql
select
  ...
  n."position",
  ...
```

