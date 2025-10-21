# Migration Guide - Hybrid Search with Document Embeddings

This guide explains how to set up and use the hybrid search system with optional document-level embeddings.

## System Overview

The search system has two phases:

**Phase 1: Hybrid Search (BM25 + Vector)**
- Combines keyword matching (BM25) with semantic similarity (vector embeddings)
- Searches across all documents
- Good for general retrieval

**Phase 2: Smart Hybrid Search (Document Embeddings + BM25 + Vector)**
- First filters to relevant documents using document-level embeddings
- Then applies hybrid search within those documents
- Excellent for preventing cross-domain errors (e.g., financial query returning technical book chunks)

## Prerequisites

Before starting, make sure you've run the cleanup:
1. Apply `supabase-cleanup.sql` to remove old artifacts
2. Your database should be clean of old metadata filtering functions

## Phase 1: Basic Hybrid Search

### Step 1: Apply Hybrid Search Migration

1. Go to: https://pvpjcgowebeutsfkvomx.supabase.co
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase-hybrid-search-simple.sql`
4. Click "Run"

This creates:
- `bm25_rank()` - Helper function for BM25 scoring
- `hybrid_search_simple()` - Pure BM25 + vector search

### Step 2: Configure Environment

In `.env.local`:
```bash
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=false
```

### Step 3: Test

```bash
npm run dev
```

Try a query and check the logs:
```
[POST /api/chat] Using hybrid search (BM25 + vector) without document filtering
```

You should see chunks with `bm25_score`, `vector_score`, and `combined_score`.

## Phase 2: Smart Hybrid Search (Optional)

This adds document-level filtering for better precision.

### Step 1: Apply Document Embeddings Migration

1. In Supabase SQL Editor
2. Copy and paste the contents of `supabase-document-embeddings.sql`
3. Click "Run"

This creates:
- `document_embedding` column in documents table
- `find_relevant_documents()` - Find relevant documents by embedding similarity
- `smart_hybrid_search()` - Hybrid search with automatic document filtering

### Step 2: Generate Document Embeddings

```bash
npx tsx scripts/generate-document-embeddings.ts
```

This will:
- Create a summary from each document's chunks
- Generate an embedding for each document
- Store embeddings in the database

**Cost**: ~$0.0001 per document (very minimal)

### Step 3: Enable Document Embeddings

In `.env.local`:
```bash
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=true
```

### Step 4: Test

```bash
npm run dev
```

Try the same query and check the logs:
```
[POST /api/chat] Using smart hybrid search with document-level embeddings
```

You should now see `document_similarity` scores showing how relevant each source document is.

## How It Works

### Phase 1 (Hybrid Search):
```
User Query → Generate Embedding → BM25 + Vector Search → Ranked Results
                                   (search all documents)
```

### Phase 2 (Smart Hybrid):
```
User Query → Generate Embedding → Find Relevant Docs → BM25 + Vector → Results
                                  (doc-level filter)    (within docs)
```

**Benefits of Phase 2**:
- Prevents cross-domain errors (financial query → technical book)
- Better precision on domain-specific queries
- Semantic understanding of document relevance
- Automatic fallback if no relevant documents found

## Monitoring

Check logs to see which search mode is active and the scores:

```javascript
// Phase 1
{
  bm25_score: 0.4521,
  vector_score: 0.7821,
  combined_score: 0.6834,
  rank_method: 'hybrid'
}

// Phase 2 (adds document_similarity)
{
  bm25_score: 0.4521,
  vector_score: 0.7821,
  combined_score: 0.6834,
  document_similarity: 0.8934,  // ← How relevant the source document is
  rank_method: 'hybrid'
}
```

## Configuration Modes

| ENABLE_HYBRID_SEARCH | ENABLE_DOCUMENT_EMBEDDINGS | Result |
|---------------------|---------------------------|---------|
| false | false | Vector-only search |
| true | false | Hybrid search (BM25 + vector) |
| true | true | Smart hybrid (document filter + BM25 + vector) |

## Best Practices

1. **Start with Phase 1** - Test hybrid search without document embeddings first
2. **Compare results** - Toggle between modes to see the difference
3. **Monitor analytics** - Use the quality monitoring dashboard to track improvements
4. **Adjust weights** - You can tune `bm25_weight` and `vector_weight` in `route.ts` if needed

Default weights: 30% BM25, 70% vector (works well for most cases)

## Troubleshooting

**Error: Function does not exist**
- Make sure you've applied the SQL migrations in order
- Check that functions exist: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%search%';`

**No chunks returned**
- Lower the `match_threshold` in `route.ts` (default 0.5)
- Check that your documents have embeddings
- Verify `company_id` filter is correct

**Document embeddings not working**
- Make sure you ran `generate-document-embeddings.ts`
- Check that `document_embedding` column has data
- Verify `ENABLE_DOCUMENT_EMBEDDINGS=true` in `.env.local`
