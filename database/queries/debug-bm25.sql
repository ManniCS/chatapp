-- Debug BM25 matching for a specific query and chunk

-- 1. Check what the query becomes after tsquery processing
SELECT plainto_tsquery('english', 'Using only the provided context; how much money did solar sales spend last year?') as parsed_query;

-- Expected output: 'provid' & 'context' & 'money' & 'solar' & 'sale' & 'spend' & 'year'

-- 2. Check if a specific chunk text matches the query
-- Replace 'Schedule C for Solar Sales...' with your actual chunk text
SELECT 
  to_tsvector('english', 'Schedule C for Solar Sales (Business 1) (2024)') as chunk_vector,
  to_tsvector('english', 'Schedule C for Solar Sales (Business 1) (2024)') @@ 
    plainto_tsquery('english', 'Using only the provided context; how much money did solar sales spend last year?') as matches;

-- 3. See which terms from the query are in the chunk
SELECT 
  ts_debug('english', 'Schedule C for Solar Sales (Business 1) (2024)');

-- 4. Find chunks that DO match the keyword query
SELECT 
  dc.chunk_index,
  dc.chunk_text,
  bm25_rank(to_tsvector('english', dc.chunk_text), 
            plainto_tsquery('english', 'Using only the provided context; how much money did solar sales spend last year?')) as bm25_score
FROM document_chunks dc
INNER JOIN documents d ON dc.document_id = d.id
WHERE d.original_name ILIKE '%Solar%'
  AND to_tsvector('english', dc.chunk_text) @@ 
      plainto_tsquery('english', 'Using only the provided context; how much money did solar sales spend last year?')
ORDER BY bm25_score DESC
LIMIT 5;

-- 5. Why might chunks not match?
-- Possible reasons:
--   a) None of the important query terms appear in the chunk
--   b) PostgreSQL stemming changes words (e.g., "sales" -> "sale", "spent" -> "spend")
--   c) The chunk only matches via semantic similarity, not keywords
