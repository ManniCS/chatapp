import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { extractTextFromFile, chunkText } from "@/lib/documents/processor";
import { generateEmbeddings } from "@/lib/chat/openai";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    console.log("[POST /api/documents/upload] Starting upload");
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[POST /api/documents/upload] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user) {
      console.error("[POST /api/documents/upload] No user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[POST /api/documents/upload] User authenticated:", user.id);

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("[POST /api/documents/upload] No file in request");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(
      "[POST /api/documents/upload] File received:",
      file.name,
      "Type:",
      file.type,
      "Size:",
      file.size,
    );

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (!allowedTypes.includes(file.type)) {
      console.error(
        "[POST /api/documents/upload] Invalid file type:",
        file.type,
      );
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, TXT, DOCX, DOC" },
        { status: 400 },
      );
    }

    // Validate file size (50MB max)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      console.error("[POST /api/documents/upload] File too large:", file.size);
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB" },
        { status: 400 },
      );
    }

    // Save file to local storage
    console.log("[POST /api/documents/upload] Saving file to local storage");
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const filename = `${uuidv4()}-${file.name}`;
    const filepath = path.join(uploadsDir, filename);

    await writeFile(filepath, buffer);
    console.log("[POST /api/documents/upload] File saved to:", filepath);

    // Extract text from file
    console.log("[POST /api/documents/upload] Extracting text from file");
    const content = await extractTextFromFile(filepath, file.type);
    console.log(
      "[POST /api/documents/upload] Extracted text length:",
      content.length,
      "characters",
    );

    // Insert document into database
    console.log(
      "[POST /api/documents/upload] Inserting document into database",
    );
    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert({
        company_id: user.id,
        filename,
        original_name: file.name,
        storage_path: filepath,
        file_type: file.type,
        file_size: file.size,
        content,
      })
      .select()
      .single();

    if (docError) {
      console.error(
        "[POST /api/documents/upload] Database error inserting document:",
        docError,
      );
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    console.log(
      "[POST /api/documents/upload] Document inserted with ID:",
      document.id,
    );

    // Chunk the text and generate embeddings
    if (content) {
      const chunks = chunkText(content);
      console.log(
        "[POST /api/documents/upload] Created",
        chunks.length,
        "chunks",
      );

      // Generate embeddings for all chunks in batch
      console.log(
        "[POST /api/documents/upload] Generating embeddings for all chunks in batch",
      );
      const embeddings = await generateEmbeddings(chunks);
      console.log(
        "[POST /api/documents/upload] Generated",
        embeddings.length,
        "embeddings",
      );

      // Insert all chunks with their embeddings
      const chunkRecords = chunks.map((chunkText, i) => ({
        document_id: document.id,
        chunk_text: chunkText,
        chunk_index: i,
        embedding: JSON.stringify(embeddings[i]),
      }));

      console.log(
        "[POST /api/documents/upload] Inserting",
        chunkRecords.length,
        "chunks into database",
      );

      const { error: chunkError } = await supabase
        .from("document_chunks")
        .insert(chunkRecords);

      if (chunkError) {
        console.error(
          "[POST /api/documents/upload] Error inserting chunks:",
          chunkError,
        );
        return NextResponse.json(
          { error: "Failed to insert document chunks" },
          { status: 500 },
        );
      }

      console.log("[POST /api/documents/upload] All chunks processed");
    }

    console.log("[POST /api/documents/upload] Upload completed successfully");
    return NextResponse.json(
      { message: "Document uploaded successfully", document },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/documents/upload] Unexpected error:", error);
    if (error instanceof Error) {
      console.error("[POST /api/documents/upload] Error stack:", error.stack);
    }
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
