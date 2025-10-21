-- Clear all document embeddings and summaries to regenerate with improved approach
UPDATE documents 
SET document_embedding = NULL, 
    document_summary = NULL;

-- Verify the update
SELECT COUNT(*) as total_documents,
       COUNT(document_embedding) as with_embeddings,
       COUNT(document_summary) as with_summaries
FROM documents;
