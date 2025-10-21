# Search System Documentation

## Overview

This RAG (Retrieval-Augmented Generation) system uses a sophisticated hybrid search approach combining multiple ranking signals for accurate document retrieval.

## Architecture

### Components

1. **Vector Embeddings** (OpenAI text-embedding-ada-002)
   - Chunk-level embeddings for semantic similarity
   - Document-level embeddings for relevance filtering

2. **BM25 Keyword Search** (PostgreSQL full-text search)
   - Traditional keyword-based ranking
   - Good for exact term matching

3. **Hybrid Ranking**
   - Combines BM25 (30%) + Vector similarity (70%)
   - Best of both worlds: keywords + semantics

4. **Document-Level Filtering** (Optional)
   - Uses document embeddings to find relevant documents first
   - Prevents cross-domain errors

## Search Modes

### Mode 1: Vector-Only Search
```bash
ENABLE_HYBRID_SEARCH=false
ENABLE_DOCUMENT_EMBEDDINGS=false
```
- Pure cosine similarity search
- Fast and simple
- May miss keyword-specific queries

### Mode 2: Hybrid Search
```bash
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=false
```
- BM25 keyword matching + vector similarity
- Searches all documents
- Balanced precision and recall

### Mode 3: Smart Hybrid Search
```bash
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=true
```
- Document-level filtering first
- Then hybrid search within relevant documents
- Best precision for domain-specific queries

## Database Schema

### Key Tables

**documents**
- `id` - Primary key
- `company_id` - Multi-tenancy
- `original_name` - Document filename
- `file_path` - Storage location
- `document_embedding` - Vector(1536) for document-level similarity

**document_chunks**
- `id` - Primary key
- `document_id` - Foreign key
- `chunk_text` - Text content
- `chunk_index` - Position in document
- `embedding` - Vector(1536) for chunk similarity

**query_analytics**
- Tracks all queries and responses
- Quality metrics (similarity scores, latency, etc.)
- Refusal detection

### Key Functions

**hybrid_search_simple()**
- Pure BM25 + vector search
- No metadata dependencies
- Returns: chunks with scores

**smart_hybrid_search()**
- Document filtering + hybrid search
- Uses document embeddings
- Returns: chunks with document similarity scores

**find_relevant_documents()**
- Document-level similarity search
- Filters documents before chunk search

## Setup

### 1. Database Setup

```bash
# Clean up old artifacts (if upgrading)
# Run in Supabase SQL Editor
supabase-cleanup.sql

# Apply hybrid search
supabase-hybrid-search-simple.sql

# (Optional) Apply document embeddings
supabase-document-embeddings.sql
```

### 2. Generate Document Embeddings (if using Phase 2)

```bash
npx tsx scripts/generate-document-embeddings.ts
```

### 3. Configure Environment

```bash
# .env.local
ENABLE_HYBRID_SEARCH=true
ENABLE_DOCUMENT_EMBEDDINGS=false  # Set to true after generating embeddings
```

### 4. Start Server

```bash
npm run dev
```

## API Usage

### Chat Endpoint

```typescript
POST /api/chat

Request:
{
  "message": "User question",
  "companyId": "uuid",
  "sessionId": "uuid" (optional)
}

Response:
{
  "response": "AI response",
  "sessionId": "uuid",
  "analyticsId": "uuid"
}
```

### Search Flow

1. User sends message
2. Generate embedding for query
3. Search for relevant chunks:
   - Mode 1: Vector similarity
   - Mode 2: BM25 + vector hybrid
   - Mode 3: Document filter → hybrid search
4. Merge consecutive chunks from same document
5. Build context from top chunks
6. Send to GPT with context
7. Return response + analytics

## Quality Monitoring

### Automatic Metrics

- `avg_similarity` - Average chunk relevance
- `chunks_retrieved` - Number of chunks found
- `contained_refusal` - Whether response said "I don't know"
- `latency_ms` - Response time
- `num_merged_chunks` - Chunks after merging

### User Feedback

Users can provide thumbs up/down on responses:

```typescript
POST /api/chat/feedback
{
  "analyticsId": "uuid",
  "feedback": 1 or -1
}
```

### LLM-as-Judge (Optional)

Set `AUTO_SCORE_RESPONSES=true` to enable automatic quality scoring:
- Relevance (0-1)
- Completeness (0-1)
- Accuracy (0-1)
- Coherence (0-1)

## Performance Tuning

### Chunk Size
Default: 2000 characters with 400 overlap
- Larger chunks = more context but less precision
- Smaller chunks = better precision but may fragment

Location: `lib/documents/processor.ts`

### Search Weights
Default: 30% BM25, 70% vector
- More BM25 = better keyword matching
- More vector = better semantic understanding

Location: `app/api/chat/route.ts`

### Similarity Threshold
Default: 0.5 for hybrid, 0.7 for vector-only
- Lower = more results but less relevant
- Higher = fewer results but more precise

### Document Similarity Threshold
Default: 0.6
- Controls how strict document filtering is
- Only used in Mode 3

## Troubleshooting

**Problem: No chunks returned**
- Check similarity threshold (try lowering)
- Verify embeddings exist for documents
- Check company_id filtering

**Problem: Wrong documents returned**
- Enable document embeddings (Mode 3)
- Check document embedding quality
- Adjust document_similarity_threshold

**Problem: Slow queries**
- Check vector index exists: `idx_document_chunks_embedding`
- Check FTS index exists: `idx_document_chunks_fts`
- Monitor `latency_ms` in analytics

**Problem: "I don't know" responses**
- Check if relevant chunks exist
- Review chunk content in logs
- Adjust system prompt in `route.ts`
- Check temperature setting (default 0.7)

## Files Reference

### Core Code
- `app/api/chat/route.ts` - Main chat endpoint
- `lib/documents/processor.ts` - PDF parsing and chunking
- `lib/chat/openai.ts` - OpenAI API wrapper

### Database
- `supabase-cleanup.sql` - Clean up old artifacts
- `supabase-hybrid-search-simple.sql` - Hybrid search setup
- `supabase-document-embeddings.sql` - Document embeddings setup

### Scripts
- `scripts/generate-document-embeddings.ts` - Generate doc embeddings
- `scripts/pdf_parser.py` - Python PDF extraction with OCR

### Documentation
- `MIGRATION_STEPS.md` - Migration guide
- `TESTING_GUIDE.md` - How to test different modes
- `CLEANUP_STEPS.md` - Database cleanup guide

## Best Practices

1. **Start simple** - Use Mode 2 (hybrid) first, add document embeddings if needed
2. **Monitor analytics** - Track quality metrics over time
3. **Test queries** - Keep a set of test queries to validate improvements
4. **Chunk appropriately** - Balance context vs precision
5. **Update embeddings** - Regenerate when documents change significantly

## Future Improvements

Potential enhancements:
- Reranking with cross-encoder models
- Query expansion/reformulation
- Conversational context awareness
- Custom embedding models
- Adaptive threshold tuning
