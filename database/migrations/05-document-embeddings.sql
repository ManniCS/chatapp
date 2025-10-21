-- Add document-level embeddings for smarter filtering
-- Instead of naive keyword matching, use semantic similarity at document level

-- Step 1: Add embedding column for document metadata
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_embedding vector(1536);

-- Step 2: Create index for fast document-level similarity search
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
  ON documents 
  USING ivfflat (document_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 3: Function to find relevant documents for a query
CREATE OR REPLACE FUNCTION find_relevant_documents(
  query_embedding vector(1536),
  similarity_threshold float DEFAULT 0.6,
  company_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  original_name text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    original_name,
    1 - (document_embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE document_embedding IS NOT NULL
    AND (company_id_filter IS NULL OR company_id = company_id_filter)
    AND 1 - (document_embedding <=> query_embedding) > similarity_threshold
  ORDER BY document_embedding <=> query_embedding
  LIMIT 10;
$$;

-- Step 4: Enhanced hybrid search that auto-filters by document relevance
CREATE OR REPLACE FUNCTION smart_hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_company_id uuid DEFAULT NULL,
  document_similarity_threshold float DEFAULT 0.6,
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
  document_similarity float,
  rank_method text
)
LANGUAGE plpgsql
AS $$
DECLARE
  query_tsquery tsquery;
  relevant_doc_ids uuid[];
BEGIN
  query_tsquery := plainto_tsquery('english', query_text);
  
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
  keyword_results AS (
    SELECT 
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      bm25_rank(to_tsvector('english', dc.chunk_text), query_tsquery) as bm25_score,
      0.0 as vector_score,
      1 - (d.document_embedding <=> query_embedding) as doc_similarity
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE to_tsvector('english', dc.chunk_text) @@ query_tsquery
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
      AND (relevant_doc_ids IS NULL OR d.id = ANY(relevant_doc_ids))
  ),
  vector_results AS (
    SELECT 
      dc.id,
      dc.document_id,
      dc.chunk_text,
      dc.chunk_index,
      0.0 as bm25_score,
      (1 - (dc.embedding <=> query_embedding)) as vector_score,
      1 - (d.document_embedding <=> query_embedding) as doc_similarity
    FROM document_chunks dc
    INNER JOIN documents d ON dc.document_id = d.id
    WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
      AND (filter_company_id IS NULL OR d.company_id = filter_company_id)
      AND (relevant_doc_ids IS NULL OR d.id = ANY(relevant_doc_ids))
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
      COALESCE(k.doc_similarity, v.doc_similarity) as doc_similarity,
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
    c.doc_similarity,
    c.rank_method
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION find_relevant_documents IS 'Find documents relevant to query using document-level embeddings';
COMMENT ON FUNCTION smart_hybrid_search IS 'Hybrid search that automatically filters to relevant documents using document embeddings';
