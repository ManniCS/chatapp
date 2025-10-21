import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findSmallestDocument() {
  const { data: documents, error } = await supabase
    .from("documents")
    .select(`
      id, 
      original_name,
      document_chunks(count)
    `)
    .order("id");

  if (error || !documents) {
    console.error("Error fetching documents:", error);
    process.exit(1);
  }

  // Find document with fewest chunks
  const docsWithChunkCount = await Promise.all(
    documents.map(async (doc) => {
      const { count } = await supabase
        .from("document_chunks")
        .select("*", { count: "exact", head: true })
        .eq("document_id", doc.id);
      
      return { ...doc, chunkCount: count || 0 };
    })
  );

  docsWithChunkCount.sort((a, b) => a.chunkCount - b.chunkCount);

  console.log("Documents by chunk count:\n");
  docsWithChunkCount.forEach((doc) => {
    console.log(`  ${doc.original_name}: ${doc.chunkCount} chunks`);
  });

  if (docsWithChunkCount.length > 0) {
    console.log(`\nSmallest document: ${docsWithChunkCount[0].original_name}`);
    console.log(`ID: ${docsWithChunkCount[0].id}`);
    console.log(`Chunks: ${docsWithChunkCount[0].chunkCount}`);
  }
}

findSmallestDocument().catch(console.error);
