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

    // Search for relevant document chunks using Supabase's vector search
    console.log(
      "[POST /api/chat] Searching for relevant chunks with threshold: 0.7, count: 5",
    );
    const { data: relevantChunks, error: searchError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.7,
        match_count: 5,
        filter_company_id: companyId,
      },
    );

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
          similarity: chunk.similarity?.toFixed(4) || "N/A",
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
      avg_similarity: number;
      max_similarity: number;
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

      // Sort merged chunks by max similarity (best match first)
      mergedChunks.sort((a, b) => b.max_similarity - a.max_similarity);

      console.log("[POST /api/chat] Merged chunks:", mergedChunks.length);
      mergedChunks.forEach((merged, index) => {
        console.log(`[POST /api/chat] Merged chunk ${index + 1}:`, {
          document_id: merged.document_id,
          original_chunks: merged.chunk_ids.length,
          chunk_indices: merged.chunk_indices.join(", "),
          max_similarity: merged.max_similarity.toFixed(4),
          avg_similarity: merged.avg_similarity.toFixed(4),
          text_length: merged.merged_text.length,
          text_preview: merged.merged_text.substring(0, 150) + "...",
        });
      });
    }

    // Helper function to create merged chunk
    function createMergedChunk(chunks: any[]): MergedChunk {
      return {
        document_id: chunks[0].document_id,
        chunk_ids: chunks.map((c) => c.id),
        chunk_indices: chunks.map((c) => c.chunk_index),
        merged_text: chunks.map((c) => c.chunk_text).join(" "),
        avg_similarity:
          chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length,
        max_similarity: Math.max(...chunks.map((c) => c.similarity)),
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
      // Log full context for debugging
      console.log("[POST /api/chat] ========== FULL CONTEXT START ==========");
      console.log(context);
      console.log("[POST /api/chat] ========== FULL CONTEXT END ==========");
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
        content: `You are a helpful assistant that answers questions based on the provided context. If the context doesn't contain relevant information, say so politely. Context:\n\n${context}`,
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
    const avgSimilarity =
      relevantChunks && relevantChunks.length > 0
        ? relevantChunks.reduce(
            (sum: number, chunk: any) => sum + (chunk.similarity || 0),
            0,
          ) / relevantChunks.length
        : 0;

    // Estimate token usage (rough approximation: 1 token ≈ 4 characters)
    const promptText = messages.map((m: any) => m.content).join(" ");
    const estimatedPromptTokens = Math.ceil(promptText.length / 4);
    const estimatedCompletionTokens = Math.ceil(chatResponse.length / 4);

    // Save query analytics
    const analyticsId = uuidv4();
    await supabase.from("query_analytics").insert({
      id: analyticsId,
      company_id: companyId,
      query_text: message,
      chunks_retrieved: relevantChunks?.length || 0,
      avg_similarity: avgSimilarity,
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
        similarity_score: chunk.similarity || 0,
        chunk_text: chunk.chunk_text,
      }));

      await supabase.from("query_chunks").insert(chunkRecords);
    }

    console.log("[POST /api/chat] Analytics saved:", {
      analyticsId,
      chunksRetrieved: relevantChunks?.length || 0,
      avgSimilarity: avgSimilarity.toFixed(4),
      latencyMs: latency,
    });

    return NextResponse.json({
      response: chatResponse,
      sessionId: currentSessionId,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
