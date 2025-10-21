/**
 * Test script to generate a summary for a single document
 * Usage: DOCUMENT_ID=<id> npx tsx scripts/test-single-summary.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// Use the medium-sized document by default
const DOCUMENT_ID = process.env.DOCUMENT_ID || "0fb73ffe-2d06-4be5-bd03-97fa8754eab9";

/**
 * Coalesces overlapping chunks by removing duplicate content at boundaries.
 */
function coalesceChunks(chunks: Array<{ chunk_text: string }>): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0].chunk_text;

  let result = chunks[0].chunk_text;

  for (let i = 1; i < chunks.length; i++) {
    const currentChunk = chunks[i].chunk_text;
    
    let overlapFound = false;
    for (let overlapSize = Math.min(400, result.length, currentChunk.length); overlapSize >= 50; overlapSize--) {
      const endOfResult = result.slice(-overlapSize);
      const startOfCurrent = currentChunk.slice(0, overlapSize);
      
      if (endOfResult === startOfCurrent) {
        result += currentChunk.slice(overlapSize);
        overlapFound = true;
        break;
      }
    }
    
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
    max_tokens: 500,
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
    max_tokens: 1500,
  });

  return response.choices[0].message.content || "";
}

async function testSummarization() {
  console.log("Testing summarization on a single document...\n");

  // Fetch the document
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, original_name")
    .eq("id", DOCUMENT_ID)
    .single();

  if (docError || !doc) {
    console.error("Document not found:", docError);
    process.exit(1);
  }

  console.log(`Document: ${doc.original_name}`);
  console.log(`ID: ${doc.id}\n`);

  // Fetch chunks
  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("chunk_text, chunk_index")
    .eq("document_id", doc.id)
    .order("chunk_index", { ascending: true });

  if (chunksError || !chunks) {
    console.error("Error fetching chunks:", chunksError);
    process.exit(1);
  }

  console.log(`Total chunks: ${chunks.length}\n`);

  // Map-reduce summarization
  const CHUNKS_PER_BATCH = 10;
  const batchSummaries: string[] = [];
  
  const startTime = Date.now();
  
  for (let i = 0; i < chunks.length; i += CHUNKS_PER_BATCH) {
    const batchChunks = chunks.slice(i, i + CHUNKS_PER_BATCH);
    const batchNumber = Math.floor(i / CHUNKS_PER_BATCH) + 1;
    const totalBatches = Math.ceil(chunks.length / CHUNKS_PER_BATCH);
    
    console.log(`Processing batch ${batchNumber}/${totalBatches} (chunks ${i + 1}-${i + batchChunks.length})`);
    
    // Coalesce the chunks to remove overlap
    const coalescedText = coalesceChunks(batchChunks);
    console.log(`  Coalesced text length: ${coalescedText.length} chars`);
    
    // Summarize this batch
    const batchSummary = await summarizeBatch(coalescedText, batchNumber, totalBatches);
    console.log(`  Batch summary length: ${batchSummary.length} chars`);
    console.log(`  Preview: ${batchSummary.substring(0, 100)}...`);
    batchSummaries.push(batchSummary);
    
    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\nGenerated ${batchSummaries.length} batch summaries`);
  console.log(`Combining into final summary...\n`);

  const finalSummary = await combineSummaries(batchSummaries, doc.original_name);
  
  const elapsed = Date.now() - startTime;
  
  console.log("=====================================");
  console.log("FINAL SUMMARY");
  console.log("=====================================");
  console.log(finalSummary);
  console.log("\n=====================================");
  console.log(`Summary length: ${finalSummary.length} characters`);
  console.log(`Time elapsed: ${(elapsed / 1000).toFixed(1)} seconds`);
  console.log("=====================================");
}

testSummarization().catch(console.error);
