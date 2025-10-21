# Search Testing Guide

This guide explains how to test different search configurations to compare their performance.

## Test Configurations

You can test three different search modes by changing environment variables:

| Configuration | ENABLE_HYBRID_SEARCH | ENABLE_DOCUMENT_EMBEDDINGS | What it does |
|--------------|---------------------|---------------------------|--------------|
| **Vector Only** | false | false | Pure cosine similarity search |
| **Hybrid Search** | true | false | BM25 (30%) + Vector (70%) |
| **Smart Hybrid** | true | true | Document filtering + BM25 + Vector |

## Phase 1: Test Hybrid Search (BM25 + Vector)

### Current Configuration
Your `.env.local` is currently set to:
```bash
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=false
```

This tests **hybrid search without document-level filtering**.

### What to test:
1. Start your dev server: `npm run dev`
2. Ask the problematic query: 
   - "Using only the provided context; how much money did solar sales spend last year?"
3. Check the logs to see:
   - Which documents the chunks came from
   - The BM25 scores vs vector scores
   - Whether it still returns chunks from "Designing Data-Intensive Applications"

### Expected behavior:
- Should use BM25 + vector ranking
- May still return some irrelevant documents (no filtering yet)
- Logs will show: `[POST /api/chat] Using hybrid search (BM25 + vector) without document filtering`

## Phase 2: Test Smart Hybrid Search (with Document Embeddings)

### Prerequisites
Before testing this mode, you MUST:

1. **Apply the database migration**:
   - Go to Supabase SQL Editor: https://pvpjcgowebeutsfkvomx.supabase.co
   - Copy and run the SQL from `supabase-document-embeddings.sql`
   - This adds the `document_embedding` column and functions

2. **Generate document embeddings**:
   ```bash
   npx tsx scripts/generate-document-embeddings.ts
   ```
   - This will process all your documents
   - Creates summaries and generates embeddings
   - Costs: ~$0.0001 per document (very minimal)

3. **Update environment variable**:
   ```bash
   # In .env.local, change this line:
   ENABLE_DOCUMENT_EMBEDDINGS=true
   ```

4. **Restart dev server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

### What to test:
1. Ask the same query again:
   - "Using only the provided context; how much money did solar sales spend last year?"
2. Check the logs for:
   - `document_similarity` scores for each chunk
   - Should filter out irrelevant documents before searching
   - Logs will show: `[POST /api/chat] Using smart hybrid search with document-level embeddings`

### Expected behavior:
- Should first find relevant documents using document-level embeddings
- Then search only within those documents
- Should NOT return chunks from irrelevant books
- Better precision on domain-specific queries

## Comparison Test Queries

Try these queries with different configurations to compare:

### Financial Queries (should match financial docs only):
- "How much money did solar sales spend last year?"
- "What was our revenue in Q4?"
- "Show me the budget breakdown"

### Technical Queries (should match technical docs only):
- "How does the database handle concurrent writes?"
- "Explain the system architecture"
- "What is the API rate limiting strategy?"

### Design Queries (should match design docs only):
- "What grid system should I use?"
- "Explain the typography guidelines"
- "What are the color palette rules?"

## What to Look For

### In the logs:
```
[POST /api/chat] Chunk 1: {
  document_id: '...',
  combined_score: 0.8234,      // Higher = better match
  bm25_score: 0.4521,          // Keyword matching score
  vector_score: 0.7821,        // Semantic similarity score
  document_similarity: 0.8934, // Only in Phase 2 (how relevant the document is)
  rank_method: 'hybrid'        // hybrid | keyword_only | vector_only
}
```

### Good signs:
- ✅ Chunks come from relevant documents only
- ✅ High `document_similarity` for relevant docs (Phase 2)
- ✅ Balanced `bm25_score` and `vector_score`
- ✅ No "I don't have that information" refusals on answerable questions

### Bad signs:
- ❌ Chunks from completely unrelated documents
- ❌ Low `document_similarity` but still retrieved (Phase 2)
- ❌ Only `keyword_only` or `vector_only` matches (should see `hybrid`)
- ❌ Frequent refusals when information exists

## Performance Comparison

| Metric | Vector Only | Hybrid Search | Smart Hybrid |
|--------|-------------|---------------|--------------|
| Precision | Medium | High | Very High |
| Recall | High | High | Medium-High |
| Speed | Fast | Medium | Medium |
| Cross-domain errors | Common | Less common | Rare |

## Rollback

If you want to go back to an earlier configuration:

```bash
# Vector only (original)
ENABLE_HYBRID_SEARCH=false
ENABLE_DOCUMENT_EMBEDDINGS=false

# Hybrid only (Phase 1)
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=false

# Smart hybrid (Phase 2)
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=true
```

Always restart your dev server after changing environment variables!

## Next Steps

After testing both phases:
1. Decide which configuration works best for your use case
2. Document any edge cases or problematic queries
3. Consider adjusting the weights (bm25_weight, vector_weight) in `route.ts` if needed
4. Monitor the analytics dashboard to track quality metrics over time
