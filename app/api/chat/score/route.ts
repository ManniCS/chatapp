import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { scoreResponse } from "@/lib/chat/quality-scorer";

/**
 * POST /api/chat/score
 * Score a specific query's response quality using LLM-as-judge
 */
export async function POST(request: Request) {
  try {
    const { analyticsId, method = 'heuristic' } = await request.json();

    if (!analyticsId) {
      return NextResponse.json(
        { error: "analyticsId is required" },
        { status: 400 },
      );
    }

    if (!['gpt4', 'gpt3.5', 'heuristic'].includes(method)) {
      return NextResponse.json(
        { error: "method must be 'gpt4', 'gpt3.5', or 'heuristic'" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the query analytics with context
    const { data: analytics, error: fetchError } = await supabase
      .from("query_analytics")
      .select("*")
      .eq("id", analyticsId)
      .eq("company_id", user.id)
      .single();

    if (fetchError || !analytics) {
      return NextResponse.json(
        { error: "Query not found" },
        { status: 404 },
      );
    }

    // Fetch the chunks that were used
    const { data: chunks } = await supabase
      .from("query_chunks")
      .select("chunk_text")
      .eq("query_analytics_id", analyticsId);

    // Reconstruct context
    const context = chunks?.map(c => c.chunk_text).join("\n\n") || "";

    console.log(`[POST /api/chat/score] Scoring ${analyticsId} with method: ${method}`);

    // Score the response
    const scores = await scoreResponse(
      analytics.query_text,
      context,
      analytics.response_text || "",
      analytics.chunks_retrieved || 0,
      analytics.avg_similarity || 0,
      method as 'gpt4' | 'gpt3.5' | 'heuristic'
    );

    // Save scores to database
    const { error: insertError } = await supabase
      .from("response_quality_scores")
      .insert({
        query_analytics_id: analyticsId,
        relevance_score: scores.relevance,
        completeness_score: scores.completeness,
        accuracy_score: scores.accuracy,
        coherence_score: scores.coherence,
        overall_score: scores.overall,
        scoring_method: scores.method,
      });

    if (insertError) {
      console.error("[POST /api/chat/score] Error saving scores:", insertError);
      return NextResponse.json(
        { error: "Failed to save scores" },
        { status: 500 },
      );
    }

    console.log(`[POST /api/chat/score] Scored ${analyticsId}: ${(scores.overall * 100).toFixed(1)}%`);

    return NextResponse.json({
      success: true,
      scores: {
        relevance: scores.relevance,
        completeness: scores.completeness,
        accuracy: scores.accuracy,
        coherence: scores.coherence,
        overall: scores.overall,
        reasoning: scores.reasoning,
      },
    });
  } catch (error) {
    console.error("[POST /api/chat/score] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/chat/score?analyticsId=xxx
 * Retrieve existing quality scores for a query
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const analyticsId = searchParams.get("analyticsId");

    if (!analyticsId) {
      return NextResponse.json(
        { error: "analyticsId is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch scores
    const { data: scores, error: fetchError } = await supabase
      .from("response_quality_scores")
      .select("*")
      .eq("query_analytics_id", analyticsId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "Scores not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ scores });
  } catch (error) {
    console.error("[GET /api/chat/score] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
