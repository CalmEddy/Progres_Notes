# RAG Notes App

A note-taking application with semantic search powered by OpenAI embeddings and Supabase (Postgres + pgvector).

## Features

- **User Authentication**: Sign up and log in with email/password via Supabase Auth
- **Note Management**: Create, view, and manage your personal notes
- **Semantic Search**: Search your notes using natural language queries powered by OpenAI embeddings and pgvector similarity search
- **Private Notes**: Each user can only see and search their own notes (enforced by Row-Level Security)

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm** or **pnpm**: Package manager
- **Supabase Account**: Free tier is sufficient
- **OpenAI API Key**: For generating embeddings

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install dependencies
npm install
```

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click "New Project"
3. Fill in your project details:
   - Name your project (e.g., "rag-notes")
   - Set a database password (save this securely)
   - Choose a region close to you
4. Wait for the project to be created (takes a few minutes)

### 3. Set Up the Database Schema

1. In your Supabase project dashboard, go to the **SQL Editor** (left sidebar)
2. Click "New Query"
3. Open the file `supabase/schema.sql` from this repository
4. Copy **all the contents** of `supabase/schema.sql`
5. Paste it into the Supabase SQL Editor
6. Click "Run" (or press Ctrl+Enter / Cmd+Enter)

This will:
- Enable the `pgcrypto` and `vector` extensions
- Create the `notes` table with a vector column for embeddings
- Set up Row-Level Security (RLS) policies so users can only access their own notes
- Create a `match_notes` function for semantic similarity search

### 4. Configure Email Authentication (Optional for Development)

By default, Supabase requires users to confirm their email before signing in. For development, you can disable this:

1. In your Supabase project dashboard, go to **Authentication** → **Providers** (left sidebar)
2. Find **Email** in the list and click on it
3. Scroll down to **Email Auth** settings
4. **Uncheck** "Enable email confirmations" (or leave it checked if you want email confirmation)
5. Click **Save**

**Note**: If you keep email confirmation enabled, users will need to check their email and click the confirmation link before they can sign in. The app will show a message directing them to check their email after signup.

### 5. Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API** (left sidebar)
2. You'll see:
   - **Project URL** (this is your `NEXT_PUBLIC_SUPABASE_URL`)
   - **anon/public key** (this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Copy both values (you'll need them for the `.env.local` file)

### 6. Get Your OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in or create an account
3. Go to **API Keys** (in your account menu)
4. Click "Create new secret key"
5. Give it a name (e.g., "RAG Notes App")
6. Copy the key immediately (you won't be able to see it again)

### 7. Create Environment Variables File

1. In the root of this project, create a file named `.env.local`
2. Add the following content (replace with your actual values):

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

**Example:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-proj-...
```

**Important:**
- Never commit `.env.local` to git (it's already in `.gitignore`)
- The `NEXT_PUBLIC_*` variables are safe to expose in the browser (they're public)
- The `OPENAI_API_KEY` is server-only and will never be exposed to the browser

### 8. Run the Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## How It Works

### Architecture Overview

1. **Authentication**: Supabase Auth handles user signup, login, and session management
2. **Database**: Supabase Postgres stores notes with:
   - Standard columns: `id`, `user_id`, `title`, `body`, `created_at`, `updated_at`
   - Vector column: `embedding` (1536-dimensional vector from OpenAI)
3. **Embeddings**: When you create or update a note:
   - The app combines the title and body text
   - Sends it to OpenAI's `text-embedding-3-small` model
   - Stores the resulting embedding vector in the database
4. **Search**: When you search:
   - Your query is converted to an embedding
   - The `match_notes` PostgreSQL function uses pgvector to find notes with similar embeddings
   - Results are ranked by similarity score and returned

### Security

- **Row-Level Security (RLS)**: Database policies ensure users can only access their own notes
- **Server-Side API Keys**: OpenAI API key is only used on the server, never exposed to the browser
- **Supabase Auth**: Handles secure authentication and session management

### Embedding Model

This app uses OpenAI's `text-embedding-3-small` model, which:
- Produces 1536-dimensional vectors
- Is cost-effective and fast
- Provides good semantic understanding for note search

## Project Structure

```
.
├── app/
│   ├── api/
│   │   └── notes/
│   │       ├── route.ts          # API routes for listing/creating notes
│   │       └── search/
│   │           └── route.ts      # API route for semantic search
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx          # Login page
│   │   └── signup/
│   │       └── page.tsx          # Signup page
│   ├── notes/
│   │   ├── page.tsx              # Notes page (server component)
│   │   └── NotesClient.tsx       # Notes page (client component)
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
├── lib/
│   ├── supabaseClient.ts         # Supabase client setup
│   ├── openaiClient.ts           # OpenAI client setup
│   ├── embeddings.ts             # Embedding generation
│   └── notes.ts                  # Note CRUD and search functions
├── supabase/
│   └── schema.sql                # Database schema (run in Supabase SQL Editor)
└── README.md                     # This file
```

## Usage

1. **Sign Up**: Create an account with your email and password
2. **Create Notes**: Add a title (optional) and body text, then click "Save Note"
3. **View Notes**: All your notes appear in the "All Notes" section, ordered by most recent
4. **Search**: Type a natural language query (e.g., "cat shedding", "prayer and suffering") and click "Search"
   - Results show similarity scores (higher = more relevant)
   - Only notes above the similarity threshold (0.7) are shown

## Troubleshooting

### "Missing Supabase environment variables" error
- Make sure `.env.local` exists in the project root
- Verify all three environment variables are set correctly
- Restart the dev server after creating/updating `.env.local`

### "Failed to create note" or embedding errors
- Check that your OpenAI API key is valid and has credits
- Verify the Supabase database schema was set up correctly (run `schema.sql`)
- Check the browser console and server logs for detailed error messages

### Search returns no results
- Make sure you have notes with embeddings (create some notes first)
- Try lowering the similarity threshold in `lib/notes.ts` (default is 0.7)
- Ensure your search query is meaningful (very short queries may not match well)

### Authentication issues
- Verify your Supabase project URL and anon key are correct
- Check that email/password authentication is enabled in Supabase (Settings → Authentication → Providers)

## Next Steps

This app currently implements the **retrieval** part of RAG. To extend it:

- Add a chat interface that uses the retrieved notes as context
- Integrate with an LLM (like OpenAI's GPT models) to generate responses based on retrieved notes
- Add note editing and deletion functionality
- Implement note categories or tags
- Add export functionality

## License

This project is provided as-is for educational and personal use.

