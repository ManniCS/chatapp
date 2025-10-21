-- Cleanup Script: Remove Unused Search Functions and Artifacts
-- Run this BEFORE applying supabase-hybrid-search-simple.sql

-- =============================================================================
-- STEP 1: Identify what exists (information only - these are SELECT queries)
-- =============================================================================

-- List all search-related functions
SELECT 
  'FUNCTION' as type,
  routine_name as name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%search%' 
    OR routine_name LIKE '%bm25%'
    OR routine_name LIKE '%match%'
    OR routine_name LIKE '%document%'
    OR routine_name LIKE '%query%'
  )
ORDER BY routine_name;

-- List columns in documents table
SELECT 
  'COLUMN' as type,
  column_name as name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
ORDER BY ordinal_position;

-- List indexes on document_chunks
SELECT
  'INDEX' as type,
  indexname as name,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'document_chunks'
ORDER BY indexname;

-- =============================================================================
-- STEP 2: Drop old/unused search functions
-- =============================================================================

-- Drop old hybrid search functions (if they exist)
-- Note: Must specify exact parameter signature
DROP FUNCTION IF EXISTS hybrid_search(text, vector, float, int, uuid, float, float) CASCADE;
DROP FUNCTION IF EXISTS hybrid_search_with_metadata(text, vector, float, int, uuid, text[], text[], float, float) CASCADE;
DROP FUNCTION IF EXISTS compare_search_methods(text, vector, uuid) CASCADE;

-- Drop old metadata filtering function (if exists)
DROP FUNCTION IF EXISTS match_documents_with_metadata(vector, float, int, uuid, text[]) CASCADE;

-- Drop query routing/classification functions (if they exist)
DROP FUNCTION IF EXISTS classify_query(text) CASCADE;
DROP FUNCTION IF EXISTS classify_query_heuristic(text) CASCADE;
DROP FUNCTION IF EXISTS should_filter_documents(jsonb) CASCADE;

-- =============================================================================
-- STEP 3: Remove unused columns from documents table
-- =============================================================================

-- Check if document_type column exists and is actually used
DO $$
BEGIN
  -- Only drop if column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'document_type'
  ) THEN
    -- Drop the column
    ALTER TABLE documents DROP COLUMN IF EXISTS document_type CASCADE;
    RAISE NOTICE 'Dropped column: document_type';
  ELSE
    RAISE NOTICE 'Column document_type does not exist (already clean)';
  END IF;
END $$;

-- Drop tags column if it exists (was used for naive filtering)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'documents' 
      AND column_name = 'tags'
  ) THEN
    ALTER TABLE documents DROP COLUMN IF EXISTS tags CASCADE;
    RAISE NOTICE 'Dropped column: tags';
  ELSE
    RAISE NOTICE 'Column tags does not exist (already clean)';
  END IF;
END $$;

-- =============================================================================
-- STEP 4: Clean up any duplicate indexes
-- =============================================================================

-- Drop old/duplicate full-text search indexes (keep only idx_document_chunks_fts)
DROP INDEX IF EXISTS idx_chunks_fts CASCADE;
DROP INDEX IF EXISTS document_chunks_fts_idx CASCADE;

-- Drop old/duplicate vector indexes (we'll recreate the correct one)
DROP INDEX IF EXISTS idx_chunks_embedding CASCADE;
DROP INDEX IF EXISTS document_chunks_embedding_idx CASCADE;

-- =============================================================================
-- STEP 5: Verification queries
-- =============================================================================

-- Show remaining functions (should only see match_documents and any analytics functions)
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%search%' 
    OR routine_name LIKE '%match%'
  )
ORDER BY routine_name;

-- Show remaining columns in documents table
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
ORDER BY ordinal_position;

-- Show remaining indexes on document_chunks
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'document_chunks'
ORDER BY indexname;

-- =============================================================================
-- Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Cleanup complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Review the verification queries above';
  RAISE NOTICE '2. Apply supabase-hybrid-search-simple.sql';
  RAISE NOTICE '3. Test with ENABLE_HYBRID_SEARCH=true';
  RAISE NOTICE '=================================================================';
END $$;
