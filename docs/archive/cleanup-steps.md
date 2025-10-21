# Complete Cleanup and Migration Steps

Follow these steps in order to clean up old artifacts and set up the new hybrid search system.

## Step 1: Backup (Recommended)

While this cleanup is safe, it's always good to have a backup point. In Supabase:

1. Go to Database → Backups
2. Note the latest automatic backup time
3. Or trigger a manual backup if available in your plan

## Step 2: Run Cleanup Script

1. **Go to Supabase SQL Editor**: https://pvpjcgowebeutsfkvomx.supabase.co/project/pvpjcgowebeutsfkvomx/sql/new

2. **Copy the entire contents** of `supabase-cleanup.sql`

3. **Paste and Run**

4. **Review the output**:
   - Look at the NOTICE messages to see what was dropped
   - Check the verification queries at the end
   - Make sure no errors occurred

### What This Cleanup Does

**Removes**:
- ❌ `hybrid_search()` - Old hybrid search function
- ❌ `hybrid_search_with_metadata()` - Function requiring document_type column
- ❌ `compare_search_methods()` - Testing helper
- ❌ `match_documents_with_metadata()` - Old metadata filtering
- ❌ `classify_query()` functions - Naive keyword classification
- ❌ `document_type` column - From naive metadata system
- ❌ `tags` column - From naive metadata system
- ❌ Duplicate indexes (if any exist)

**Keeps**:
- ✅ `match_documents()` - Original vector search (used as fallback)
- ✅ All data in `documents` and `document_chunks` tables
- ✅ `query_analytics` and quality monitoring tables
- ✅ All embeddings you've already generated
- ✅ Essential indexes

## Step 3: Apply New Hybrid Search Migration

1. **In the same SQL Editor**, clear the previous query

2. **Copy the entire contents** of `supabase-hybrid-search-simple.sql`

3. **Paste and Run**

4. **Verify success**: You should see:
   ```
   CREATE FUNCTION
   CREATE INDEX
   GRANT
   COMMENT
   ```

### What This Creates

- ✅ `bm25_rank()` - Helper for BM25 scoring
- ✅ `hybrid_search_simple()` - Clean BM25 + vector search (no metadata dependencies)
- ✅ `idx_document_chunks_fts` - Full-text search index for BM25

## Step 4: Verify Setup

Run this verification query in SQL Editor:

```sql
-- Check that the new function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('hybrid_search_simple', 'bm25_rank', 'match_documents')
ORDER BY routine_name;
```

**Expected output**: You should see 3 functions:
- `bm25_rank` (function)
- `hybrid_search_simple` (function)
- `match_documents` (function)

## Step 5: Test the New Search

1. **Restart your dev server** (to pick up any environment changes):
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Verify environment variables** in `.env.local`:
   ```bash
   ENABLE_HYBRID_SEARCH=true
   ENABLE_DOCUMENT_EMBEDDINGS=false
   ```

3. **Test with your problematic query**:
   ```
   Using only the provided context; how much money did solar sales spend last year?
   ```

4. **Check the logs** - you should see:
   ```
   [POST /api/chat] Using hybrid search (BM25 + vector) without document filtering
   [POST /api/chat] Retrieved chunks: X
   [POST /api/chat] Chunk 1: {
     combined_score: 0.xxxx,
     bm25_score: 0.xxxx,
     vector_score: 0.xxxx,
     rank_method: 'hybrid'
   }
   ```

5. **No errors!** The `column d.document_type does not exist` error should be gone.

## Step 6: Later - Phase 2 (Document Embeddings)

When you're ready to test document-level embeddings:

1. **Apply**: `supabase-document-embeddings.sql` in SQL Editor
2. **Generate embeddings**: `npx tsx scripts/generate-document-embeddings.ts`
3. **Enable**: Set `ENABLE_DOCUMENT_EMBEDDINGS=true` in `.env.local`
4. **Restart** your server

## Rollback Plan

If something goes wrong:

1. **Supabase has automatic backups** - you can restore to before the cleanup
2. **The old SQL files** are still in your repo if you need to recreate something
3. **Your data is safe** - we only dropped functions and columns, not data tables

## What You've Accomplished

After these steps, you'll have:

✅ **Clean database** - No unused functions or columns  
✅ **Simple hybrid search** - BM25 + vector without metadata dependencies  
✅ **No naive filtering** - Removed keyword-based document classification  
✅ **Ready for Phase 2** - Can add document embeddings later  
✅ **All data preserved** - No loss of documents or embeddings  

## Summary

```bash
# 1. Backup (optional but recommended)
# 2. Run supabase-cleanup.sql
# 3. Run supabase-hybrid-search-simple.sql
# 4. Verify with test query
# 5. Test hybrid search
```

That's it! Your database will be clean and the new hybrid search system will be ready to use.
