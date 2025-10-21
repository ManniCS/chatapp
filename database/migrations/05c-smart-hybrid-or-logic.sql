-- Final fix: Use OR logic for BM25 scoring in smart hybrid search
-- This allows partial keyword matches to receive proper BM25 scores

CREATE OR REPLACE FUNCTION smart_hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_company_id uuid DEFAULT NULL,
  document_similarity_threshold float DEFAULT 0.6,
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
  document_similarity float,
  rank_method text)
LANGUAGE plpgsql
AS $$
DECLARE
  query_tsquery_and tsquery;
  query_tsquery_or tsquery;
  relevant_doc_ids uuid[];
BEGIN
  -- Create AND query for strict boolean matching
  query_tsquery_and := plainto_tsquery('english', query_text);
  
  -- Create OR query for BM25 scoring (more lenient)
  -- Convert 'term1 & term2 & term3' to 'term1 | term2 | term3'
  query_tsquery_or := to_tsquery('english', 
    replace(query_tsquery_and::text, ' & ', ' | ')
  );
  
  -- First, find relevant documents using document-level embeddings
  SELECT ARRAY_AGG(d.id)
  INTO relevant_doc_ids
  FROM find_relevant_documents(
    query_embedding,
    document_similarity_threshold,
    filter_company_id
  ) d;
  
  -- If we found relevant documents, filter to those
  -- Otherwise, search all documents (fallback)
  
  RETURN QUERY
  WITH 
  -- Get vector results (chunks above similarity threshold)
  vector_results AS (
    SELECT 
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      (1 - (dc.embedding <=> query_embedding)) as vector_score,
      1 - (d.document_embedding <=> query_embedding) as doc_similarity
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
      AND (relevant_doc_ids IS NULL OR d.id = ANY(relevant_doc_ids))
  ),
  -- Calculate BM25 scores using OR logic (any matching terms score)
  scored_results AS (
    SELECT
      v.id,
      v.document_id,
      v.chunk_text,
      v.chunk_index,
      bm25_rank(to_tsvector('english', v.chunk_text), query_tsquery_or) as bm25_score,
      v.vector_score,
      v.doc_similarity,
      -- Check if it would have passed the strict AND boolean filter
      to_tsvector('english', v.chunk_text) @@ query_tsquery_and as is_boolean_match
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
    s.doc_similarity,
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

COMMENT ON FUNCTION smart_hybrid_search IS 'Hybrid search with document-level filtering and OR-based BM25 scoring for partial keyword matches';
