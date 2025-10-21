#!/bin/bash

# Helper script to run SQL queries against Supabase database
# Usage: 
#   ./scripts/utilities/db-query.sh "SELECT COUNT(*) FROM documents;"
#   ./scripts/utilities/db-query.sh -f database/queries/debug-bm25.sql

set -e

# Load DATABASE_URL from .env.local if it exists
if [ -f .env.local ]; then
  export $(grep DATABASE_URL .env.local | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set"
  echo ""
  echo "Please set DATABASE_URL in .env.local or your shell environment"
  echo "Get the connection string from: Supabase Settings > Database > Connection string"
  echo ""
  echo "Example:"
  echo '  DATABASE_URL="postgresql://postgres.pvpjcgowebeutsfkvomx:[PASSWORD]@...pooler.supabase.com:6543/postgres"'
  exit 1
fi

# Run query
if [ "$1" = "-f" ]; then
  # Run from file
  psql "$DATABASE_URL" -f "$2"
else
  # Run inline query
  psql "$DATABASE_URL" -c "$1"
fi
