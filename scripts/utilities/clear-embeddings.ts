import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearEmbeddings() {
  console.log("Clearing all document embeddings and summaries...\n");

  const { error } = await supabase
    .from("documents")
    .update({
      document_embedding: null,
      document_summary: null,
    })
    .not("id", "is", null); // Update all documents

  if (error) {
    console.error("Error clearing embeddings:", error);
    process.exit(1);
  }

  console.log("✓ Successfully cleared all embeddings and summaries\n");

  // Verify
  const { data: stats, error: statsError } = await supabase
    .from("documents")
    .select("id, document_embedding, document_summary");

  if (statsError) {
    console.error("Error fetching stats:", statsError);
    process.exit(1);
  }

  const total = stats?.length || 0;
  const withEmbeddings = stats?.filter((d) => d.document_embedding).length || 0;
  const withSummaries = stats?.filter((d) => d.document_summary).length || 0;

  console.log("Current state:");
  console.log(`  Total documents: ${total}`);
  console.log(`  With embeddings: ${withEmbeddings}`);
  console.log(`  With summaries: ${withSummaries}`);
  console.log("\nReady to regenerate embeddings with improved summarization!");
}

clearEmbeddings().catch(console.error);
