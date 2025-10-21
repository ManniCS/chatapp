import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { analyticsId, feedback, comment } = await request.json();

    if (!analyticsId || feedback === undefined) {
      return NextResponse.json(
        { error: "analyticsId and feedback are required" },
        { status: 400 },
      );
    }

    // Validate feedback value (1 = thumbs up, -1 = thumbs down)
    if (![1, -1].includes(feedback)) {
      return NextResponse.json(
        { error: "feedback must be 1 (thumbs up) or -1 (thumbs down)" },
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

    // Update the query analytics with user feedback
    const { error: updateError } = await supabase
      .from("query_analytics")
      .update({
        user_feedback: feedback,
        feedback_comment: comment || null,
      })
      .eq("id", analyticsId)
      .eq("company_id", user.id); // Ensure user owns this query

    if (updateError) {
      console.error("[POST /api/chat/feedback] Error updating feedback:", updateError);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 },
      );
    }

    console.log(`[POST /api/chat/feedback] Saved feedback for analytics ${analyticsId}: ${feedback}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/chat/feedback] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
