-- Add document_summary column to store the text used for embedding generation
-- This helps with quality assessment and debugging

-- Step 1: Add the column
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS document_summary text;

-- Step 2: Add a comment explaining the column
COMMENT ON COLUMN documents.document_summary IS 
  'Summary text used to generate document_embedding. Contains excerpts from beginning, middle, and end of document.';

-- Step 3: Create a view to see document embedding status
CREATE OR REPLACE VIEW document_embedding_status AS
SELECT 
  id,
  original_name,
  CASE 
    WHEN document_embedding IS NOT NULL THEN 'Has embedding'
    ELSE 'No embedding'
  END as embedding_status,
  CASE 
    WHEN document_summary IS NOT NULL THEN LENGTH(document_summary)
    ELSE NULL
  END as summary_length,
  CASE 
    WHEN document_summary IS NOT NULL THEN LEFT(document_summary, 200) || '...'
    ELSE NULL
  END as summary_preview
FROM documents
ORDER BY original_name;

COMMENT ON VIEW document_embedding_status IS 
  'Shows which documents have embeddings and provides a preview of their summaries';

-- Step 4: Query to inspect document embeddings and summaries
-- Run this to see all documents and their embedding status:
-- SELECT * FROM document_embedding_status;

-- Query to see full summary for a specific document:
-- SELECT original_name, document_summary FROM documents WHERE id = 'your-doc-id';

-- Query to find documents missing embeddings:
-- SELECT original_name FROM documents WHERE document_embedding IS NULL;
