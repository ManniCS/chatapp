import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeDocument() {
  // Find the Designing Data-Intensive Applications document
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, original_name")
    .ilike("original_name", "%Designing%Data%")
    .single();

  if (docError || !doc) {
    console.error("Document not found:", docError);
    process.exit(1);
  }

  console.log(`Document: ${doc.original_name}`);
  console.log(`ID: ${doc.id}\n`);

  // Get chunk statistics
  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("chunk_text")
    .eq("document_id", doc.id);

  if (chunksError || !chunks) {
    console.error("Error fetching chunks:", chunksError);
    process.exit(1);
  }

  const totalChunks = chunks.length;
  const totalChars = chunks.reduce((sum, c) => sum + c.chunk_text.length, 0);
  const avgCharsPerChunk = Math.round(totalChars / totalChunks);
  
  // Rough token estimate: ~4 characters per token
  const estimatedTokens = Math.round(totalChars / 4);

  console.log("Statistics:");
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Total characters: ${totalChars.toLocaleString()}`);
  console.log(`  Avg chars/chunk: ${avgCharsPerChunk.toLocaleString()}`);
  console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()}\n`);

  // Cost estimates for different approaches
  console.log("Cost Estimates for LLM Summarization:\n");

  // Approach 1: Send all chunks at once (if it fits in context)
  const gpt4oMiniInputCost = 0.150 / 1_000_000; // $0.150 per 1M input tokens
  const gpt4oMiniOutputCost = 0.600 / 1_000_000; // $0.600 per 1M output tokens
  const estimatedOutputTokens = 1000; // ~1000 tokens for a good summary
  
  const singlePassCost = 
    (estimatedTokens * gpt4oMiniInputCost) + 
    (estimatedOutputTokens * gpt4oMiniOutputCost);

  console.log("Approach 1: Single-pass (send all text at once)");
  console.log(`  Model: GPT-4o-mini`);
  console.log(`  Input tokens: ~${estimatedTokens.toLocaleString()}`);
  console.log(`  Output tokens: ~${estimatedOutputTokens.toLocaleString()}`);
  console.log(`  Cost: $${singlePassCost.toFixed(4)}\n`);

  // Approach 2: Map-reduce (chunk summaries then combine)
  const chunksPerBatch = 10;
  const batches = Math.ceil(totalChunks / chunksPerBatch);
  const tokensPerBatch = Math.round((avgCharsPerChunk * chunksPerBatch) / 4);
  const outputPerBatch = 200; // ~200 tokens per batch summary
  
  const mapPhaseCost = batches * (
    (tokensPerBatch * gpt4oMiniInputCost) + 
    (outputPerBatch * gpt4oMiniOutputCost)
  );
  
  const reducePhaseTokens = batches * outputPerBatch;
  const reducePhaseCost = 
    (reducePhaseTokens * gpt4oMiniInputCost) + 
    (estimatedOutputTokens * gpt4oMiniOutputCost);
  
  const totalMapReduceCost = mapPhaseCost + reducePhaseCost;

  console.log("Approach 2: Map-reduce (summarize in batches, then combine)");
  console.log(`  Model: GPT-4o-mini`);
  console.log(`  Map phase: ${batches} batches × ~${tokensPerBatch.toLocaleString()} tokens`);
  console.log(`  Reduce phase: ~${reducePhaseTokens.toLocaleString()} tokens`);
  console.log(`  Total cost: $${totalMapReduceCost.toFixed(4)}\n`);

  console.log(`Context window check:`);
  console.log(`  GPT-4o-mini supports 128k tokens`);
  console.log(`  This document: ~${estimatedTokens.toLocaleString()} tokens`);
  console.log(`  Fits in context: ${estimatedTokens < 128000 ? "✓ YES" : "✗ NO"}`);
}

analyzeDocument().catch(console.error);
