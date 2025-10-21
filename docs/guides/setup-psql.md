# Setup psql CLI for Supabase

This guide shows you how to configure your local `psql` CLI to connect to your Supabase database.

## Step 1: Get Your Database Connection String

1. Go to your Supabase project: https://pvpjcgowebeutsfkvomx.supabase.co
2. Click on **Settings** (gear icon in sidebar)
3. Go to **Database**
4. Scroll down to **Connection string**
5. Select **URI** tab
6. Copy the connection string (looks like):
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
7. Replace `[YOUR-PASSWORD]` with your actual database password

**Note:** If you don't remember your database password, you can reset it on the same page.

## Step 2: Set Environment Variable

Add the connection string to your shell configuration:

**For zsh (macOS default):**
```bash
echo 'export DATABASE_URL="postgresql://postgres.pvpjcgowebeutsfkvomx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"' >> ~/.zshrc
source ~/.zshrc
```

**For bash:**
```bash
echo 'export DATABASE_URL="postgresql://postgres.pvpjcgowebeutsfkvomx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"' >> ~/.bashrc
source ~/.bashrc
```

**Or add to `.env.local` (for this project only):**
```bash
# Add this line to .env.local
DATABASE_URL="postgresql://postgres.pvpjcgowebeutsfkvomx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

## Step 3: Test Connection

```bash
# Using DATABASE_URL from environment
psql "$DATABASE_URL"

# Or connect directly
psql "postgresql://postgres.pvpjcgowebeutsfkvomx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

You should see:
```
psql (14.x, server 15.x)
Type "help" for help.

postgres=>
```

## Step 4: Run Queries

Now you can run SQL queries directly:

```bash
# Run a single query
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM documents;"

# Run a query from a file
psql "$DATABASE_URL" -f database/queries/debug-bm25.sql

# Interactive mode
psql "$DATABASE_URL"
```

## Common Commands in psql

Once connected:

- `\dt` - List all tables
- `\df` - List all functions
- `\d table_name` - Describe a table
- `\q` - Quit
- `\i filename.sql` - Execute SQL file
- `\timing` - Show query execution time

## Troubleshooting

**Connection refused / timeout:**
- Check your internet connection
- Verify the connection string is correct
- Make sure you're using the pooler connection (port 6543), not direct (port 5432)

**Authentication failed:**
- Double-check your database password
- Reset password in Supabase Settings > Database if needed

**psql not found:**
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client
```

## Security Note

Never commit your `DATABASE_URL` with the password to git. It's already in `.gitignore` via `.env.local`.
