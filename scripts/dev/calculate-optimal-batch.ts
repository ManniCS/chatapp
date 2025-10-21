/**
 * Calculate optimal batch size for summarization
 */

// GPT-4o-mini context window
const MAX_CONTEXT_TOKENS = 128_000;

// Reserve tokens for:
// - System prompt and instructions: ~200 tokens
// - Output (batch summary): ~500 tokens
const RESERVED_TOKENS = 700;

// Available tokens for input text
const AVAILABLE_INPUT_TOKENS = MAX_CONTEXT_TOKENS - RESERVED_TOKENS;

// Chunk characteristics (from our analysis)
const AVG_CHUNK_SIZE = 1000; // characters
const CHUNK_OVERLAP = 400; // characters
const EFFECTIVE_CHUNK_SIZE = AVG_CHUNK_SIZE - (CHUNK_OVERLAP * 0.6); // After coalescing

// Token estimation (rough: 4 chars per token)
const CHARS_PER_TOKEN = 4;

// Calculate max chunks per batch
const effectiveTokensPerChunk = EFFECTIVE_CHUNK_SIZE / CHARS_PER_TOKEN;
const maxChunksPerBatch = Math.floor(AVAILABLE_INPUT_TOKENS / effectiveTokensPerChunk);

console.log("Batch Size Calculation");
console.log("======================\n");
console.log("Context Window Limits:");
console.log(`  GPT-4o-mini max context: ${MAX_CONTEXT_TOKENS.toLocaleString()} tokens`);
console.log(`  Reserved for prompt/output: ${RESERVED_TOKENS.toLocaleString()} tokens`);
console.log(`  Available for input: ${AVAILABLE_INPUT_TOKENS.toLocaleString()} tokens\n`);

console.log("Chunk Characteristics:");
console.log(`  Average chunk size: ${AVG_CHUNK_SIZE} chars`);
console.log(`  Overlap: ${CHUNK_OVERLAP} chars`);
console.log(`  Effective size after coalescing: ~${EFFECTIVE_CHUNK_SIZE.toFixed(0)} chars`);
console.log(`  Effective tokens per chunk: ~${effectiveTokensPerChunk.toFixed(0)} tokens\n`);

console.log("Batch Size Analysis:");
console.log(`  Maximum safe chunks/batch: ${maxChunksPerBatch}\n`);

// Test different batch sizes
const testSizes = [50, 100, 150, 200, 250, 300];

console.log("Performance Comparison (for 1000-chunk document):");
console.log("Batch Size | Batches | Est. Time | Input Tokens/Batch");
console.log("-----------|---------|-----------|-------------------");

testSizes.forEach(size => {
  if (size > maxChunksPerBatch) return;
  
  const numBatches = Math.ceil(1000 / size);
  const tokensPerBatch = size * effectiveTokensPerChunk;
  // Estimate: 200ms delay + ~2s per API call
  const estimatedSeconds = numBatches * 2.2;
  const minutes = (estimatedSeconds / 60).toFixed(1);
  
  console.log(
    `${size.toString().padEnd(10)} | ${numBatches.toString().padEnd(7)} | ${minutes.padStart(6)} min | ${tokensPerBatch.toFixed(0).padStart(17)}`
  );
});

console.log(`\n✓ Recommended: ${Math.min(200, maxChunksPerBatch)} chunks per batch`);
console.log(`  (Conservative, leaves margin for safety)`);
