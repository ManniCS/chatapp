-- Improved hybrid search that calculates BM25 scores for ALL vector results
-- This fixes the issue where chunks with high vector similarity but partial keyword matches
-- would show BM25 score of 0

CREATE OR REPLACE FUNCTION hybrid_search_simple(
  query_text text,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_company_id uuid DEFAULT NULL,
  bm25_weight float DEFAULT 0.3,
  vector_weight float DEFAULT 0.7)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  chunk_index integer,
  bm25_score float,
  vector_score float,
  combined_score float,
  rank_method text)
LANGUAGE plpgsql
AS $$
DECLARE
  query_tsquery tsquery;
BEGIN
  query_tsquery := plainto_tsquery('english', query_text);
  
  RETURN QUERY
  WITH 
  -- Get vector results (chunks above similarity threshold)
  vector_results AS (
    SELECT 
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      (1 - (dc.embedding <=> query_embedding)) as vector_score
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
  ),
  -- Calculate BM25 scores for all vector results (not just boolean matches)
  scored_results AS (
    SELECT
      v.id,
      v.document_id,
      v.chunk_text,
      v.chunk_index,
      bm25_rank(to_tsvector('english', v.chunk_text), query_tsquery) as bm25_score,
      v.vector_score,
      -- Check if it would have passed the strict boolean filter
      to_tsvector('english', v.chunk_text) @@ query_tsquery as is_boolean_match
    FROM vector_results v
  )
  SELECT 
    s.id,
    s.document_id,
    s.chunk_text,
    s.chunk_index,
    s.bm25_score,
    s.vector_score,
    (s.bm25_score * bm25_weight + s.vector_score * vector_weight) as combined_score,
    CASE
      WHEN s.is_boolean_match THEN 'hybrid'
      WHEN s.bm25_score > 0 THEN 'partial_keyword'
      ELSE 'vector_only'
    END as rank_method
  FROM scored_results s
  ORDER BY (s.bm25_score * bm25_weight + s.vector_score * vector_weight) DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search_simple IS 'Combines BM25 keyword search with vector similarity - calculates BM25 for all vector results, even partial keyword matches';
