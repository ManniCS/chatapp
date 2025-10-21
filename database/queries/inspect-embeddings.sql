-- SQL Queries for Inspecting Document Embeddings and Summaries
-- Copy and paste these into Supabase SQL Editor as needed

-- =============================================================================
-- Quick Overview: Which documents have embeddings?
-- =============================================================================

SELECT * FROM document_embedding_status;

-- Output columns:
-- - original_name: Document filename
-- - embedding_status: "Has embedding" or "No embedding"
-- - summary_length: Character count of the summary
-- - summary_preview: First 200 characters of the summary


-- =============================================================================
-- Detailed View: See full summaries for all documents
-- =============================================================================

SELECT 
  original_name,
  CASE 
    WHEN document_embedding IS NOT NULL THEN '✓ Yes'
    ELSE '✗ No'
  END as has_embedding,
  LENGTH(document_summary) as summary_length,
  document_summary
FROM documents
ORDER BY original_name;


-- =============================================================================
-- Quality Check: Find documents with unusually short/long summaries
-- =============================================================================

SELECT 
  original_name,
  LENGTH(document_summary) as summary_length,
  LEFT(document_summary, 150) || '...' as preview
FROM documents
WHERE document_summary IS NOT NULL
  AND (
    LENGTH(document_summary) < 500  -- Very short summaries (might indicate issues)
    OR LENGTH(document_summary) > 10000  -- Very long summaries (might be too verbose)
  )
ORDER BY LENGTH(document_summary);


-- =============================================================================
-- Find Specific Document: See full summary for a specific document
-- =============================================================================

SELECT 
  original_name,
  document_summary,
  LENGTH(document_summary) as summary_length
FROM documents
WHERE original_name ILIKE '%your-document-name%'  -- Replace with your document name
LIMIT 1;


-- =============================================================================
-- Missing Embeddings: Which documents need processing?
-- =============================================================================

SELECT 
  original_name,
  id
FROM documents
WHERE document_embedding IS NULL
ORDER BY original_name;


-- =============================================================================
-- Statistics: Summary length distribution
-- =============================================================================

SELECT 
  COUNT(*) as total_documents,
  COUNT(document_embedding) as documents_with_embeddings,
  COUNT(document_summary) as documents_with_summaries,
  AVG(LENGTH(document_summary)) as avg_summary_length,
  MIN(LENGTH(document_summary)) as min_summary_length,
  MAX(LENGTH(document_summary)) as max_summary_length
FROM documents;


-- =============================================================================
-- Search Summaries: Find documents by content in summary
-- =============================================================================

SELECT 
  original_name,
  LEFT(document_summary, 200) || '...' as summary_preview
FROM documents
WHERE document_summary ILIKE '%search-term%'  -- Replace with your search term
ORDER BY original_name;


-- =============================================================================
-- Compare Documents: See all summaries side by side
-- =============================================================================

SELECT 
  original_name,
  LENGTH(document_summary) as chars,
  CASE 
    WHEN document_embedding IS NOT NULL THEN '✓'
    ELSE '✗'
  END as emb,
  LEFT(document_summary, 100) || '...' as summary_start
FROM documents
ORDER BY original_name;


-- =============================================================================
-- Export Summaries: Get all summaries as JSON
-- =============================================================================

SELECT json_agg(
  json_build_object(
    'document_name', original_name,
    'summary', document_summary,
    'summary_length', LENGTH(document_summary),
    'has_embedding', document_embedding IS NOT NULL
  )
) as documents_with_summaries
FROM documents
WHERE document_summary IS NOT NULL;


-- =============================================================================
-- Quality Assessment: Documents with embeddings but no summaries (shouldn't happen)
-- =============================================================================

SELECT 
  original_name,
  id,
  'Has embedding but no summary - might need regeneration' as issue
FROM documents
WHERE document_embedding IS NOT NULL 
  AND document_summary IS NULL;


-- =============================================================================
-- Cleanup: Remove embeddings and summaries (if you want to regenerate)
-- =============================================================================

-- WARNING: This will delete embeddings and summaries for ALL documents
-- Uncomment to use:

-- UPDATE documents 
-- SET 
--   document_embedding = NULL,
--   document_summary = NULL;


-- For specific document:
-- UPDATE documents 
-- SET 
--   document_embedding = NULL,
--   document_summary = NULL
-- WHERE original_name = 'your-document-name.pdf';
