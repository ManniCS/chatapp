import fs from "fs/promises";
import mammoth from "mammoth";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

async function extractPDFText(filePath: string): Promise<string> {
  try {
    console.log("[extractPDFText] Loading PDF from:", filePath);

    // Security: Validate that the file path is within the uploads directory
    const uploadsDir = path.join(process.cwd(), "uploads");
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(uploadsDir)) {
      throw new Error("Invalid file path: outside uploads directory");
    }

    // Call Python script to extract text with security constraints
    const scriptPath = path.join(process.cwd(), "scripts", "pdf_parser.py");

    console.log("[extractPDFText] Starting Python subprocess...");
    const startTime = Date.now();

    const { stdout, stderr } = await execFileAsync(
      "python3",
      [scriptPath, filePath],
      {
        timeout: 600000, // 10 minute timeout for OCR processing
        maxBuffer: 50 * 1024 * 1024, // 50MB max output buffer
      },
    );

    const elapsed = Date.now() - startTime;
    console.log(`[extractPDFText] Python process completed in ${elapsed}ms`);

    if (stderr) {
      console.error("[extractPDFText] Python stderr:", stderr);
    }

    console.log(
      `[extractPDFText] Python stdout length: ${stdout.length} bytes`,
    );

    let result;
    try {
      result = JSON.parse(stdout);
    } catch (parseError) {
      console.error(
        "[extractPDFText] Failed to parse Python output:",
        parseError,
      );
      console.error(
        "[extractPDFText] First 1000 chars of stdout:",
        stdout.substring(0, 1000),
      );
      throw new Error("Failed to parse PDF extraction result");
    }

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log("[extractPDFText] Number of pages:", result.num_pages);
    console.log(
      "[extractPDFText] Total extracted text length:",
      result.text_length,
    );
    // Note: Not logging actual content - may contain sensitive data

    return result.text;
  } catch (error) {
    console.error("[extractPDFText] Error extracting PDF text:", error);
    throw error;
  }
}

export async function extractTextFromFile(
  filePath: string,
  fileType: string,
): Promise<string> {
  try {
    if (fileType === "application/pdf") {
      return await extractPDFText(filePath);
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileType === "application/msword"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (fileType === "text/plain") {
      return await fs.readFile(filePath, "utf-8");
    }

    return "";
  } catch (error) {
    console.error("Error extracting text:", error);
    return "";
  }
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}
