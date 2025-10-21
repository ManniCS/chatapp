import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("[GET /api/documents] Starting request");
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[GET /api/documents] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user) {
      console.error("[GET /api/documents] No user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[GET /api/documents] User authenticated:", user.id);

    // Get all documents for the company
    const { data: documents, error } = await supabase
      .from("documents")
      .select("*")
      .eq("company_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("[GET /api/documents] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(
      "[GET /api/documents] Success, found",
      documents?.length || 0,
      "documents",
    );
    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/documents] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
