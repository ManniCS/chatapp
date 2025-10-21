# Setup Instructions - Hybrid Search

You're getting the error because the hybrid search functions haven't been created in your Supabase database yet.

## Required Migrations (in order)

### Step 1: Apply Hybrid Search Migration (REQUIRED NOW)

This creates the basic hybrid search functions:

1. Go to your Supabase SQL Editor: https://pvpjcgowebeutsfkvomx.supabase.co
2. Navigate to: SQL Editor
3. Copy the contents of `supabase-hybrid-search-simple.sql`
4. Paste and click "Run"

This creates:
- `hybrid_search_simple()` - BM25 + vector search (no metadata dependencies)
- `bm25_rank()` - Helper function for keyword ranking

**You need this to test Phase 1!**

### Step 2: Apply Document Embeddings Migration (OPTIONAL - for Phase 2)

This adds document-level embeddings:

1. Same Supabase SQL Editor
2. Copy the contents of `supabase-document-embeddings.sql`
3. Paste and click "Run"

This creates:
- `document_embedding` column in documents table
- `find_relevant_documents()` - Find relevant documents using embeddings
- `smart_hybrid_search()` - Hybrid search with automatic document filtering

**You only need this when ready for Phase 2 testing.**

### Step 3: Generate Document Embeddings (OPTIONAL - for Phase 2)

After applying the document embeddings migration:

```bash
npx tsx scripts/generate-document-embeddings.ts
```

## Summary

**Right now you need:**
- ✅ Apply `supabase-hybrid-search-simple.sql` to fix the current error

**Later for Phase 2:**
- ⏳ Apply `supabase-document-embeddings.sql`
- ⏳ Run `npx tsx scripts/generate-document-embeddings.ts`

## Summary of Functions

| Function | Purpose | When to use | Needs migration |
|----------|---------|-------------|-----------------|
| `match_documents` | Vector-only search | ENABLE_HYBRID_SEARCH=false | Already exists |
| `hybrid_search_simple` | BM25 + Vector (no metadata) | Phase 1 testing | `supabase-hybrid-search-simple.sql` |
| `smart_hybrid_search` | Document filtering + BM25 + Vector | Phase 2 testing | `supabase-document-embeddings.sql` |

**Phase 1** uses `hybrid_search_simple` which is pure BM25 + vector search without any document type filtering or metadata dependencies.

**Phase 2** uses `smart_hybrid_search` which adds intelligent document-level filtering using embeddings.
