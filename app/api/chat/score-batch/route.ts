import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { scoreResponse } from "@/lib/chat/quality-scorer";

/**
 * POST /api/chat/score-batch
 * Score multiple queries in batch
 * Useful for retroactive scoring of historical data
 */
export async function POST(request: Request) {
  try {
    const { 
      method = 'heuristic',
      limit = 50,
      onlyUnscored = true,
      since
    } = await request.json();

    if (!['gpt4', 'gpt3.5', 'heuristic'].includes(method)) {
      return NextResponse.json(
        { error: "method must be 'gpt4', 'gpt3.5', or 'heuristic'" },
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

    // Build query
    let query = supabase
      .from("query_analytics")
      .select("*")
      .eq("company_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filter to only unscored if requested
    if (onlyUnscored) {
      const { data: alreadyScored } = await supabase
        .from("response_quality_scores")
        .select("query_analytics_id");
      
      const scoredIds = alreadyScored?.map(s => s.query_analytics_id) || [];
      
      if (scoredIds.length > 0) {
        query = query.not("id", "in", `(${scoredIds.join(",")})`);
      }
    }

    // Filter by date if provided
    if (since) {
      query = query.gte("created_at", since);
    }

    const { data: analytics, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch queries" },
        { status: 500 },
      );
    }

    console.log(`[POST /api/chat/score-batch] Scoring ${analytics?.length || 0} queries with ${method}`);

    const results = [];
    const errors = [];

    // Score each query
    for (const analytic of analytics || []) {
      try {
        // Fetch chunks for this query
        const { data: chunks } = await supabase
          .from("query_chunks")
          .select("chunk_text")
          .eq("query_analytics_id", analytic.id);

        const context = chunks?.map(c => c.chunk_text).join("\n\n") || "";

        // Score the response
        const scores = await scoreResponse(
          analytic.query_text,
          context,
          analytic.response_text || "",
          analytic.chunks_retrieved || 0,
          analytic.avg_similarity || 0,
          method as 'gpt4' | 'gpt3.5' | 'heuristic'
        );

        // Save scores
        const { error: insertError } = await supabase
          .from("response_quality_scores")
          .insert({
            query_analytics_id: analytic.id,
            relevance_score: scores.relevance,
            completeness_score: scores.completeness,
            accuracy_score: scores.accuracy,
            coherence_score: scores.coherence,
            overall_score: scores.overall,
            scoring_method: scores.method,
          });

        if (insertError) {
          errors.push({
            analyticsId: analytic.id,
            error: insertError.message,
          });
        } else {
          results.push({
            analyticsId: analytic.id,
            overall_score: scores.overall,
          });
        }

        // Add small delay for GPT-based scoring to avoid rate limits
        if (method !== 'heuristic') {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        errors.push({
          analyticsId: analytic.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`[POST /api/chat/score-batch] Completed: ${results.length} scored, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      scored: results.length,
      errors: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[POST /api/chat/score-batch] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
