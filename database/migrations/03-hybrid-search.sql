-- Simplified Hybrid Search (without metadata dependencies)
-- Use this version if you don't have document_type or tags columns

-- Step 1: Add full-text search index to document_chunks
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON document_chunks
  USING GIN (to_tsvector('english', chunk_text));

-- Step 2: Create BM25-style ranking function
CREATE OR REPLACE FUNCTION bm25_rank(
  tsvector_col tsvector,
  query_tsquery tsquery
) RETURNS float AS $$
  SELECT ts_rank_cd(tsvector_col, query_tsquery, 32 /* normalization */);
$$ LANGUAGE SQL IMMUTABLE;

-- Step 3: Simple hybrid search (BM25 + Vector) without metadata
CREATE OR REPLACE FUNCTION hybrid_search_simple(
  query_text text,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_company_id uuid DEFAULT NULL,
  bm25_weight float DEFAULT 0.3,
  vector_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  chunk_index integer,
  bm25_score float,
  vector_score float,
  combined_score float,
  rank_method text
)
LANGUAGE plpgsql
AS $$
DECLARE
  query_tsquery tsquery;
BEGIN
  query_tsquery := plainto_tsquery('english', query_text);
  
  RETURN QUERY
  WITH 
  keyword_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      bm25_rank(to_tsvector('english', dc.chunk_text), query_tsquery) as bm25_score,
      0.0 as vector_score
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE to_tsvector('english', dc.chunk_text) @@ query_tsquery
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
  ),
  vector_results AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      0.0 as bm25_score,
      (1 - (dc.embedding <=> query_embedding)) as vector_score
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
  ),
  combined AS (
    SELECT
      COALESCE(k.id, v.id) as id,
      COALESCE(k.document_id, v.document_id) as document_id,
      COALESCE(k.chunk_text, v.chunk_text) as chunk_text,
      COALESCE(k.chunk_index, v.chunk_index) as chunk_index,
      COALESCE(k.bm25_score, 0.0) as bm25_score,
      COALESCE(v.vector_score, 0.0) as vector_score,
      (COALESCE(k.bm25_score, 0.0) * bm25_weight +
       COALESCE(v.vector_score, 0.0) * vector_weight) as combined_score,
      CASE
        WHEN k.id IS NOT NULL AND v.id IS NOT NULL THEN 'hybrid'
        WHEN k.id IS NOT NULL THEN 'keyword_only'
        ELSE 'vector_only'
      END as rank_method
    FROM keyword_results k
    FULL OUTER JOIN vector_results v ON k.id = v.id
  )
  SELECT
    c.id,
    c.document_id,
    c.chunk_text,
    c.chunk_index,
    c.bm25_score,
    c.vector_score,
    c.combined_score,
    c.rank_method
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION hybrid_search_simple TO authenticated;
GRANT EXECUTE ON FUNCTION bm25_rank TO authenticated;

COMMENT ON FUNCTION hybrid_search_simple IS 'Combines BM25 keyword search with vector similarity (no metadata dependencies)';
