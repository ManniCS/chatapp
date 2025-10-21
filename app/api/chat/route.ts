import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateEmbedding, chat } from "@/lib/chat/openai";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const { message, sessionId, companyId } = await request.json();

    if (!message || !companyId) {
      return NextResponse.json(
        { error: "Message and companyId are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = uuidv4();
      await supabase.from("chat_sessions").insert({
        company_id: companyId,
        session_id: currentSessionId,
      });
    }

    // Save user message
    await supabase.from("chat_messages").insert({
      session_id: currentSessionId,
      role: "user",
      content: message,
    });

    // Generate embedding for the query
    console.log(
      "[POST /api/chat] Generating embedding for query:",
      message.substring(0, 100),
    );
    const queryEmbedding = await generateEmbedding(message);
    console.log(
      "[POST /api/chat] Embedding generated, length:",
      queryEmbedding.length,
    );

    // Configure search mode based on environment variables
    const useDocumentEmbeddings =
      process.env.ENABLE_DOCUMENT_EMBEDDINGS === "true";
    const useBM25 = process.env.ENABLE_BM25 === "true";

    let relevantChunks, searchError;

    if (useDocumentEmbeddings) {
      // Smart hybrid search WITH document-level filtering
      console.log(
        `[POST /api/chat] Using smart hybrid search with document-level embeddings (BM25: ${useBM25 ? "enabled" : "disabled"})`,
      );

      const result = await supabase.rpc("smart_hybrid_search", {
        query_text: message,
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.5,
        match_count: 5,
        filter_company_id: companyId,
        document_similarity_threshold: 0.6, // Document-level filtering
        bm25_weight: useBM25 ? 0.3 : 0.0, // BM25 weight (0 = disabled)
        vector_weight: useBM25 ? 0.7 : 1.0, // Vector weight (1.0 when BM25 disabled)
      });
      relevantChunks = result.data;
      searchError = result.error;
    } else {
      // Hybrid search WITHOUT document filtering
      console.log(
        `[POST /api/chat] Using hybrid search without document filtering (BM25: ${useBM25 ? "enabled" : "disabled"})`,
      );

      const result = await supabase.rpc("hybrid_search_simple", {
        query_text: message,
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.5,
        match_count: 5,
        filter_company_id: companyId,
        bm25_weight: useBM25 ? 0.3 : 0.0, // BM25 weight (0 = disabled)
        vector_weight: useBM25 ? 0.7 : 1.0, // Vector weight (1.0 when BM25 disabled)
      });
      relevantChunks = result.data;
      searchError = result.error;
    }

    if (searchError) {
      console.error("[POST /api/chat] Search error:", searchError);
    }

    // Log retrieved chunks for debugging
    console.log(
      "[POST /api/chat] Retrieved chunks:",
      relevantChunks?.length || 0,
    );
    if (relevantChunks && relevantChunks.length > 0) {
      relevantChunks.forEach((chunk: any, index: number) => {
        console.log(`[POST /api/chat] Chunk ${index + 1}:`, {
          id: chunk.id,
          document_id: chunk.document_id,
          chunk_index: chunk.chunk_index,
          combined_score: chunk.combined_score?.toFixed(4) || "N/A",
          bm25_score: chunk.bm25_score?.toFixed(4) || "N/A",
          vector_score: chunk.vector_score?.toFixed(4) || "N/A",
          document_similarity: chunk.document_similarity?.toFixed(4) || "N/A",
          rank_method: chunk.rank_method,
          text_preview: chunk.chunk_text?.substring(0, 150) + "...",
        });
      });
    } else {
      console.log("[POST /api/chat] No chunks found matching the query");
    }

    // Group chunks by document and merge consecutive chunks
    interface MergedChunk {
      document_id: string;
      chunk_ids: string[];
      chunk_indices: number[];
      merged_text: string;
      avg_combined_score: number;
      max_combined_score: number;
      max_bm25_score: number;
      max_vector_score: number;
      max_document_similarity: number;
      avg_bm25_score: number;
      avg_vector_score: number;
      avg_document_similarity: number;
    }

    let mergedChunks: MergedChunk[] = [];

    if (relevantChunks && relevantChunks.length > 0) {
      // Group chunks by document_id
      const chunksByDocument = new Map<string, any[]>();
      relevantChunks.forEach((chunk: any) => {
        if (!chunksByDocument.has(chunk.document_id)) {
          chunksByDocument.set(chunk.document_id, []);
        }
        chunksByDocument.get(chunk.document_id)!.push(chunk);
      });

      // Process each document's chunks
      chunksByDocument.forEach((chunks, documentId) => {
        // Sort chunks by chunk_index to find consecutive sequences
        chunks.sort((a, b) => a.chunk_index - b.chunk_index);

        let currentGroup: any[] = [chunks[0]];

        for (let i = 1; i < chunks.length; i++) {
          // Check if this chunk is consecutive to the last one in the group
          const lastInGroup = currentGroup[currentGroup.length - 1];
          if (chunks[i].chunk_index === lastInGroup.chunk_index + 1) {
            // Consecutive chunk - add to current group
            currentGroup.push(chunks[i]);
          } else {
            // Not consecutive - finalize current group and start a new one
            mergedChunks.push(createMergedChunk(currentGroup));
            currentGroup = [chunks[i]];
          }
        }

        // Don't forget the last group
        if (currentGroup.length > 0) {
          mergedChunks.push(createMergedChunk(currentGroup));
        }
      });

      // Sort merged chunks by max combined score (best match first)
      mergedChunks.sort((a, b) => b.max_combined_score - a.max_combined_score);

      console.log("[POST /api/chat] Merged chunks:", mergedChunks.length);
      mergedChunks.forEach((merged, index) => {
        const chunkRange =
          merged.chunk_indices.length === 1
            ? `#${merged.chunk_indices[0]}`
            : `#${merged.chunk_indices[0]}-${merged.chunk_indices[merged.chunk_indices.length - 1]}`;

        console.log(`[POST /api/chat] Merged chunk ${index + 1}:`, {
          document_id: merged.document_id,
          chunk_range: chunkRange,
          num_chunks: merged.chunk_ids.length,
          max_combined_score: merged.max_combined_score.toFixed(4),
          avg_combined_score: merged.avg_combined_score.toFixed(4),
          text_length: merged.merged_text.length,
        });

        // Show start and end of the merged text
        const startPreview = merged.merged_text.substring(0, 100);
        const endPreview =
          merged.merged_text.length > 200
            ? "..." +
              merged.merged_text.substring(merged.merged_text.length - 100)
            : "";
        console.log(`[POST /api/chat]   Start: "${startPreview}..."`);
        if (endPreview) {
          console.log(`[POST /api/chat]   End: "${endPreview}"`);
        }
      });
    }

    // Helper function to create merged chunk
    function createMergedChunk(chunks: any[]): MergedChunk {
      return {
        document_id: chunks[0].document_id,
        chunk_ids: chunks.map((c) => c.id),
        chunk_indices: chunks.map((c) => c.chunk_index),
        merged_text: chunks.map((c) => c.chunk_text).join(" "),
        avg_combined_score:
          chunks.reduce((sum, c) => sum + (c.combined_score || 0), 0) /
          chunks.length,
        max_combined_score: Math.max(
          ...chunks.map((c) => c.combined_score || 0),
        ),
        max_bm25_score: Math.max(...chunks.map((c) => c.bm25_score || 0)),
        max_vector_score: Math.max(...chunks.map((c) => c.vector_score || 0)),
        max_document_similarity: Math.max(
          ...chunks.map((c) => c.document_similarity || 0),
        ),
        avg_bm25_score:
          chunks.reduce((sum, c) => sum + (c.bm25_score || 0), 0) /
          chunks.length,
        avg_vector_score:
          chunks.reduce((sum, c) => sum + (c.vector_score || 0), 0) /
          chunks.length,
        avg_document_similarity:
          chunks.reduce((sum, c) => sum + (c.document_similarity || 0), 0) /
          chunks.length,
      };
    }

    // Build context from merged chunks
    let context = "";
    if (mergedChunks.length > 0) {
      context = mergedChunks.map((merged) => merged.merged_text).join("\n\n");
      console.log(
        "[POST /api/chat] Context length:",
        context.length,
        "characters",
      );

      // Log full context for debugging with chunk boundaries
      console.log("[POST /api/chat] ========== FULL CONTEXT START ==========");
      mergedChunks.forEach((merged, index) => {
        const chunkRange =
          merged.chunk_indices.length === 1
            ? `#${merged.chunk_indices[0]}`
            : `#${merged.chunk_indices[0]}-${merged.chunk_indices[merged.chunk_indices.length - 1]}`;

        // Build score breakdown string
        const scoreBreakdown = [
          `Combined: ${merged.max_combined_score.toFixed(4)}`,
          `Vector: ${merged.max_vector_score.toFixed(4)}`,
          useBM25 ? `BM25: ${merged.max_bm25_score.toFixed(4)}` : null,
          merged.max_document_similarity > 0
            ? `Doc: ${merged.max_document_similarity.toFixed(4)}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          `\n--- Chunk ${index + 1} [Range: ${chunkRange}, ${scoreBreakdown}] ---`,
        );
        console.log(merged.merged_text);
        console.log(`--- End of Chunk ${index + 1} ---`);
      });
      console.log("\n[POST /api/chat] ========== FULL CONTEXT END ==========");
    }

    // Get chat history
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", currentSessionId)
      .order("created_at", { ascending: true })
      .limit(10);

    // Build messages for OpenAI
    const messages = [
      {
        role: "system",
        content: `You are a helpful assistant that answers questions based on the provided context. 

The context may contain OCR errors, fragmented sentences, or formatting issues from PDF extraction. Do your best to interpret the meaning despite these imperfections. Look for key terms, concepts, and ideas even if the text is incomplete or has typos.

If you can identify relevant information in the context, provide a helpful answer by piecing together the available information. Only say the context doesn't contain the information if you genuinely cannot find any relevant content after attempting to interpret fragmented or imperfect text.

Context:

${context}`,
      },
      ...(history || []).slice(0, -1), // Exclude the last message (the current user message we just added)
      { role: "user", content: message },
    ];

    // Get response from OpenAI
    const chatResponse = await chat(messages);

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Save assistant message
    await supabase.from("chat_messages").insert({
      session_id: currentSessionId,
      role: "assistant",
      content: chatResponse,
    });

    // Calculate analytics metrics
    const avgCombinedScore =
      relevantChunks && relevantChunks.length > 0
        ? relevantChunks.reduce(
            (sum: number, chunk: any) => sum + (chunk.combined_score || 0),
            0,
          ) / relevantChunks.length
        : 0;

    // Estimate token usage (rough approximation: 1 token ≈ 4 characters)
    const promptText = messages.map((m: any) => m.content).join(" ");
    const estimatedPromptTokens = Math.ceil(promptText.length / 4);
    const estimatedCompletionTokens = Math.ceil(chatResponse.length / 4);

    // Detect if response contains refusal
    const refusalPhrases = [
      "does not contain",
      "I don't have",
      "cannot find",
      "no information",
      "I'm sorry",
    ];
    const containedRefusal = refusalPhrases.some((phrase) =>
      chatResponse?.toLowerCase().includes(phrase.toLowerCase()),
    );

    // Save query analytics with quality metrics
    const analyticsId = uuidv4();
    await supabase.from("query_analytics").insert({
      id: analyticsId,
      company_id: companyId,
      query_text: message,
      response_text: chatResponse,
      response_length: chatResponse?.length || 0,
      contained_refusal: containedRefusal,
      chunks_retrieved: relevantChunks?.length || 0,
      avg_similarity: avgCombinedScore, // Now using combined score instead of just vector similarity
      context_length: context.length,
      num_merged_chunks: mergedChunks.length,
      openai_prompt_tokens: estimatedPromptTokens,
      openai_completion_tokens: estimatedCompletionTokens,
      latency_ms: latency,
    });

    // Save individual chunk references (all original chunks before merging)
    // This preserves full observability of which chunks were retrieved
    if (relevantChunks && relevantChunks.length > 0) {
      const chunkRecords = relevantChunks.map((chunk: any) => ({
        id: uuidv4(),
        query_analytics_id: analyticsId,
        chunk_id: chunk.id,
        similarity_score: chunk.combined_score || 0, // Store combined score
        chunk_text: chunk.chunk_text,
      }));
      await supabase.from("query_chunks").insert(chunkRecords);
    }

    console.log("[POST /api/chat] Analytics saved:", {
      analyticsId,
      chunksRetrieved: relevantChunks?.length || 0,
      avgCombinedScore: avgCombinedScore.toFixed(4),
      latencyMs: latency,
    });

    // Optional: Auto-score responses using heuristics (fast, free)
    // Set AUTO_SCORE_RESPONSES=true in env to enable
    if (process.env.AUTO_SCORE_RESPONSES === "true") {
      // Import dynamically to avoid loading if not needed
      const { scoreResponse } = await import("@/lib/chat/quality-scorer");

      try {
        const scores = await scoreResponse(
          message,
          context,
          chatResponse || "",
          relevantChunks?.length || 0,
          avgCombinedScore,
          "heuristic", // Use fast heuristic method in production
        );

        await supabase.from("response_quality_scores").insert({
          query_analytics_id: analyticsId,
          relevance_score: scores.relevance,
          completeness_score: scores.completeness,
          accuracy_score: scores.accuracy,
          coherence_score: scores.coherence,
          overall_score: scores.overall,
          scoring_method: scores.method,
        });

        console.log(
          `[POST /api/chat] Auto-scored: ${(scores.overall * 100).toFixed(1)}%`,
        );
      } catch (scoreError) {
        console.error("[POST /api/chat] Auto-scoring failed:", scoreError);
        // Don't fail the request if scoring fails
      }
    }

    return NextResponse.json({
      response: chatResponse,
      sessionId: currentSessionId,
      analyticsId: analyticsId, // Return analytics ID for feedback
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
