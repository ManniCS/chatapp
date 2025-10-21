# Quick Checklist - Setup Hybrid Search

Follow this checklist to complete the setup. Check off items as you go.

## Database Setup

- [ ] **Step 1: Clean up old artifacts**
  - Go to Supabase SQL Editor: https://pvpjcgowebeutsfkvomx.supabase.co
  - Copy and run `supabase-cleanup.sql`
  - Verify: Should see "Cleanup complete!" message

- [ ] **Step 2: Apply hybrid search migration**
  - In same SQL Editor
  - Copy and run `supabase-hybrid-search-simple.sql`
  - Verify: Should see "CREATE FUNCTION" messages

## Phase 1 Testing (Hybrid Search)

- [ ] **Step 3: Configure environment**
  - Open `.env.local`
  - Set: `ENABLE_HYBRID_SEARCH=true`
  - Set: `ENABLE_DOCUMENT_EMBEDDINGS=false`

- [ ] **Step 4: Start server**
  - Run: `npm run dev`
  - Check: Server starts without errors

- [ ] **Step 5: Test basic hybrid search**
  - Try query: "Using only the provided context; how much money did solar sales spend last year?"
  - Check logs: Should see "Using hybrid search (BM25 + vector) without document filtering"
  - Verify: No "column d.document_type does not exist" error
  - Check: Chunks returned with `bm25_score`, `vector_score`, `combined_score`

## Phase 2 Setup (Document Embeddings) - Optional

- [ ] **Step 6: Apply document embeddings migration**
  - In Supabase SQL Editor
  - Copy and run `supabase-document-embeddings.sql`
  - Verify: Should see "CREATE FUNCTION" messages

- [ ] **Step 7: Generate document embeddings**
  - Run: `npx tsx scripts/generate-document-embeddings.ts`
  - Wait: Script processes all documents
  - Check: Should see "✓ Successfully embedded" for each document
  - Verify: Final summary shows success count

- [ ] **Step 8: Enable document embeddings**
  - Open `.env.local`
  - Set: `ENABLE_DOCUMENT_EMBEDDINGS=true`
  - Restart server: `npm run dev`

- [ ] **Step 9: Test smart hybrid search**
  - Try same query again
  - Check logs: Should see "Using smart hybrid search with document-level embeddings"
  - Verify: Chunks include `document_similarity` score
  - Compare: Should filter out irrelevant documents better than Phase 1

## Verification

- [ ] **Verify cleanup worked**
  ```sql
  -- Run in Supabase SQL Editor
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_schema = 'public' AND routine_name LIKE '%search%'
  ORDER BY routine_name;
  ```
  - Should see: `find_relevant_documents`, `hybrid_search_simple`, `match_documents`, `smart_hybrid_search`
  - Should NOT see: `hybrid_search_with_metadata`, `classify_query`

- [ ] **Verify documents table**
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'documents'
  ORDER BY ordinal_position;
  ```
  - Should NOT see: `document_type`, `tags`
  - Should see: `document_embedding` (if Phase 2 complete)

## Troubleshooting

If you encounter issues:

- [ ] **"Function does not exist" error**
  - Make sure you ran the SQL migrations in order
  - Check the verification queries above

- [ ] **"Column does not exist" error**
  - Run `supabase-cleanup.sql` to remove old columns
  - Restart dev server

- [ ] **No chunks returned**
  - Check that documents have embeddings
  - Verify `company_id` is correct
  - Try lowering `match_threshold` in `route.ts`

- [ ] **Still getting document_type errors**
  - Verify cleanup script ran successfully
  - Check that old functions were dropped
  - Clear Next.js cache: `rm -rf .next && npm run dev`

## Success Criteria

You'll know everything is working when:

✅ No database errors in logs
✅ Hybrid search returns chunks with multiple scores
✅ Phase 2 includes `document_similarity` scores
✅ No references to `document_type` anywhere
✅ Test queries return relevant results

## Documentation

Reference these files for more details:

- `SEARCH_SYSTEM_README.md` - Complete system documentation
- `MIGRATION_STEPS.md` - Detailed migration guide
- `TESTING_GUIDE.md` - How to test different configurations
- `CLEANUP_SUMMARY.md` - What was cleaned up and why

## Next Steps

After completing setup:

1. Test with various queries to compare Phase 1 vs Phase 2
2. Monitor quality metrics in `query_analytics` table
3. Adjust search weights if needed (in `route.ts`)
4. Add more documents and regenerate embeddings as needed

---

**Current Status:** 
- Database cleanup: ⏳ Not started
- Phase 1 setup: ⏳ Not started  
- Phase 2 setup: ⏳ Not started

Mark items complete as you go!
