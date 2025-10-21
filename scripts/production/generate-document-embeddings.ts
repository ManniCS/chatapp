/**
 * Generate document-level embeddings for all documents
 *
 
 * This script:
 * 1. Fetches all documents that don't have embeddings yet
 * 2. For each document, creates a summary from its chunks
 * 3. Generates an embedding for the summary
 * 4. Stores the embedding in the documents table
 *
 
 * Usage:
 *   npx tsx scripts/generate-document-embeddings.ts
 */

// IMPORTANT: Load environment variables FIRST, before any other imports
import { config } from "dotenv";
config({ path: ".env.local" });

// Now import other modules (they will have access to env vars)
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Load environment variables from .env.local
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables:");
  console.error("  NEXT_PUBLIC_SUPABASE_URL");
  console.error("  SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!openaiApiKey) {
  console.error("Missing required environment variable:");
  console.error("  OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

interface Document {
  id: string;
  original_name: string;
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Coalesces overlapping chunks by removing duplicate content at boundaries.
 * Chunks are created with a 400-character overlap, so we detect and remove this.
 */
function coalesceChunks(chunks: Array<{ chunk_text: string }>): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0].chunk_text;

  let result = chunks[0].chunk_text;

  for (let i = 1; i < chunks.length; i++) {
    const currentChunk = chunks[i].chunk_text;

    // Try to find overlap by checking if the end of result matches the beginning of currentChunk
    // Start with max possible overlap (400 chars) and work down
    let overlapFound = false;
    for (
      let overlapSize = Math.min(400, result.length, currentChunk.length);
      overlapSize >= 50;
      overlapSize--
    ) {
      const endOfResult = result.slice(-overlapSize);
      const startOfCurrent = currentChunk.slice(0, overlapSize);

      if (endOfResult === startOfCurrent) {
        // Found overlap, append only the non-overlapping part
        result += currentChunk.slice(overlapSize);
        overlapFound = true;
        break;
      }
    }

    // If no overlap found, just append (shouldn't happen with our chunking strategy)
    if (!overlapFound) {
      result += "\n" + currentChunk;
    }
  }

  return result;
}

/**
 * Summarizes a batch of chunks using GPT-4o-mini
 */
async function summarizeBatch(
  batchText: string,
  batchNumber: number,
  totalBatches: number,
): Promise<string> {
  const prompt = `You are summarizing part ${batchNumber} of ${totalBatches} from a document.

Create a concise but informative summary of the following text. Focus on:
- Main topics and key concepts
- Important facts and insights
- Critical arguments or explanations

Text to summarize:
${batchText}

Provide a clear, well-structured summary:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 500, // ~200-500 tokens per batch summary
  });

  return response.choices[0].message.content || "";
}

/**
 * Combines multiple batch summaries into a final document summary
 */
async function combineSummaries(
  batchSummaries: string[],
  documentName: string,
): Promise<string> {
  const allSummaries = batchSummaries.join("\n\n---\n\n");

  const prompt = `You are creating a final summary for a document titled "${documentName}".

You have ${batchSummaries.length} partial summaries from different sections of the document.
Combine these into a single, coherent summary that:
- Provides an overview of the entire document
- Highlights the most important concepts and topics
- Maintains logical flow
- Is comprehensive yet concise (aim for 3-5 paragraphs)

Partial summaries:
${allSummaries}

Provide the final document summary:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1500, // ~1000-1500 tokens for final summary
  });

  return response.choices[0].message.content || "";
}

/**
 * Generates a high-quality summary using map-reduce approach:
 * 1. Coalesce overlapping chunks into batches
 * 2. Summarize each batch with LLM
 * 3. Combine batch summaries into final summary
 */
async function generateDocumentSummary(
  documentId: string,
  documentName: string,
): Promise<string> {
  // Fetch all chunks for this document
  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("chunk_text, chunk_index")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch chunks: ${error.message}`);
  }

  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks found for document");
  }

  console.log(`  Total chunks: ${chunks.length}`);

  // Coalesce chunks into batches
  // Each chunk is ~1000 chars, with ~400 char overlap removed = ~760 effective chars
  // 200 chunks × 760 chars = ~152,000 chars = ~38,000 tokens (well within 128k context)
  // Max theoretical is ~670 chunks, but 200 provides safe margin
  const CHUNKS_PER_BATCH = 200;
  const batchSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i += CHUNKS_PER_BATCH) {
    const batchChunks = chunks.slice(i, i + CHUNKS_PER_BATCH);
    const batchNumber = Math.floor(i / CHUNKS_PER_BATCH) + 1;
    const totalBatches = Math.ceil(chunks.length / CHUNKS_PER_BATCH);

    console.log(
      `  Processing batch ${batchNumber}/${totalBatches} (chunks ${i + 1}-${i + batchChunks.length})`,
    );

    // Coalesce the chunks to remove overlap
    const coalescedText = coalesceChunks(batchChunks);

    // Summarize this batch
    const batchSummary = await summarizeBatch(
      coalescedText,
      batchNumber,
      totalBatches,
    );
    batchSummaries.push(batchSummary);

    // Rate limiting: wait 200ms between batch API calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`  Generated ${batchSummaries.length} batch summaries`);
  console.log(`  Combining into final summary...`);

  // Combine all batch summaries into final summary
  const finalSummary = await combineSummaries(batchSummaries, documentName);

  return finalSummary;
}

async function main() {
  console.log("Starting document embedding generation...\n");

  // Fetch all documents without embeddings
  const { data: documents, error: fetchError } = await supabase
    .from("documents")
    .select("id, original_name")
    .is("document_embedding", null);

  if (fetchError) {
    console.error("Error fetching documents:", fetchError);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log("No documents need embeddings. All done!");
    return;
  }

  console.log(`Found ${documents.length} documents without embeddings\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const doc of documents as Document[]) {
    try {
      console.log(`Processing: ${doc.original_name}`);
      console.log(`  ID: ${doc.id}`);

      // Generate summary from chunks using map-reduce approach
      const summary = await generateDocumentSummary(doc.id, doc.original_name);
      console.log(`  Summary length: ${summary.length} characters`);

      // Optional: Set SHOW_SUMMARIES=true to see the actual summary text
      if (process.env.SHOW_SUMMARIES === "true") {
        console.log(`  Summary preview:\n${summary.substring(0, 300)}...\n`);
      }

      // Create a descriptive text for embedding
      const embeddingText = `Document: ${doc.original_name}\n\n${summary}`;

      // Generate embedding
      const embedding = await generateEmbedding(embeddingText);
      console.log(`  Embedding generated (${embedding.length} dimensions)`);

      // Store embedding and summary
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          document_embedding: JSON.stringify(embedding),
          document_summary: summary, // Store the summary for quality assessment
        })
        .eq("id", doc.id);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`  ✓ Successfully embedded\n`);
      successCount++;

      // Rate limiting: wait 100ms between API calls to avoid hitting OpenAI limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
      errorCount++;
    }
  }

  console.log("=====================================");
  console.log("Document embedding generation complete");
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total: ${documents.length}`);
  console.log("=====================================");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
