# Supabase Cleanup Guide

## What Might Need Cleanup

Based on the previous conversation, you may have created some functions or indexes that are no longer needed. Here's how to check and clean up.

## Step 1: Check What Functions Exist

Run this in your Supabase SQL Editor to see what search-related functions you have:

```sql
-- List all custom functions related to search
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%search%' 
    OR routine_name LIKE '%bm25%'
    OR routine_name LIKE '%document%'
  )
ORDER BY routine_name;
```

## Step 2: Expected Functions

After applying the migrations, you should have:

### Phase 1 (Hybrid Search - Required Now):
- `bm25_rank` - Helper function for BM25 scoring
- `hybrid_search_simple` - Pure BM25 + vector search
- `match_documents` - Original vector-only search (keep this as fallback)

### Phase 2 (Document Embeddings - Optional):
- `find_relevant_documents` - Find documents using embeddings
- `smart_hybrid_search` - Document filtering + hybrid search

### Functions You Can DELETE (if they exist):
- `hybrid_search` - Old version without metadata support
- `hybrid_search_with_metadata` - Version that requires document_type column
- `compare_search_methods` - Testing helper, not needed
- `match_documents_with_metadata` - Old metadata filtering version
- `classifyQuery` or similar - Naive keyword-based classification

## Step 3: Clean Up Old Functions

If you find functions from the "DELETE" list above, remove them:

```sql
-- Example: Remove old hybrid search functions if they exist
DROP FUNCTION IF EXISTS hybrid_search(text, vector, float, int, uuid, float, float);
DROP FUNCTION IF EXISTS hybrid_search_with_metadata(text, vector, float, int, uuid, text[], text[], float, float);
DROP FUNCTION IF EXISTS compare_search_methods(text, vector, uuid);
DROP FUNCTION IF EXISTS match_documents_with_metadata(vector, float, int, uuid, text[]);
```

**Note**: PostgreSQL requires you to specify the parameter types when dropping functions. If you get an error about "function does not exist", it might be because:
1. It really doesn't exist (good!)
2. The parameter types don't match (you'd need to check the exact signature)

## Step 4: Check Indexes

List all indexes on document_chunks:

```sql
-- List indexes on document_chunks table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'document_chunks'
ORDER BY indexname;
```

### Expected Indexes:
- `idx_document_chunks_fts` - Full-text search index (for BM25)
- `idx_document_chunks_embedding` - Vector index (for similarity search)
- Any primary key or foreign key indexes

### Indexes You Can DELETE (if they exist and are duplicates):
If you see multiple vector indexes or multiple full-text indexes, you only need one of each.

## Step 5: Check Documents Table Columns

Check what columns exist in your documents table:

```sql
-- List columns in documents table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;
```

### Expected Columns:
- `id` - Primary key
- `company_id` - Foreign key
- `original_name` - Document name
- `file_path` - Storage path
- `created_at` - Timestamp
- `document_embedding` - Only after Phase 2 migration (vector(1536))

### Columns That Might Exist But Aren't Used:
- `document_type` - From naive metadata filtering (safe to keep but unused)
- `tags` - From naive metadata filtering (safe to keep but unused)

**Don't delete these columns** unless you're sure you don't need them. They won't hurt anything, and your new search functions ignore them.

## Step 6: Clean Up Old Migration Files

You have these SQL files in your project:

- `supabase-hybrid-search.sql` - **Can be ignored/deleted** (old version with metadata)
- `supabase-hybrid-search-simple.sql` - **Keep and apply** (Phase 1)
- `supabase-document-embeddings.sql` - **Keep** (Phase 2)
- `supabase-migration-analytics.sql` - **Keep** (quality monitoring)
- `supabase-quality-metrics.sql` - **Keep** (quality monitoring)

## Simple Cleanup Script

If you want to start fresh with just the essentials, run this:

```sql
-- Clean up old search functions (safe to run even if they don't exist)
DROP FUNCTION IF EXISTS hybrid_search(text, vector, float, int, uuid, float, float);
DROP FUNCTION IF EXISTS hybrid_search_with_metadata(text, vector, float, int, uuid, text[], text[], float, float);
DROP FUNCTION IF EXISTS compare_search_methods(text, vector, uuid);

-- Then apply the new migrations
-- 1. Run supabase-hybrid-search-simple.sql
-- 2. Later: Run supabase-document-embeddings.sql (for Phase 2)
```

## What NOT to Delete

**Don't delete these**:
- `match_documents` - Original vector search function (used as fallback)
- `document_chunks` table or any of its data
- `documents` table or any of its data
- `query_analytics` table (for quality monitoring)
- Any embedding data you've already generated

## Summary

**Safest approach**:
1. Don't worry about cleanup right now
2. Just apply `supabase-hybrid-search-simple.sql`
3. The new functions will work alongside old ones
4. You can clean up later once you confirm everything works

**Aggressive cleanup**:
1. Run the cleanup script above to remove old functions
2. Apply `supabase-hybrid-search-simple.sql`
3. Test thoroughly

I recommend the **safest approach** first. PostgreSQL won't care if you have unused functions lying around, and it's better to keep them until you're confident the new system works.
