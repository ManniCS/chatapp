import fs from "fs/promises";
import PDFParser from "pdf2json";
import mammoth from "mammoth";

async function extractPDFText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (errData: any) => {
      console.error("PDF parsing error:", errData.parserError);
      reject(errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        console.log("[extractPDFText] PDF data received");
        console.log(
          "[extractPDFText] Number of pages:",
          pdfData.Pages?.length || 0,
        );

        let fullText = "";

        if (pdfData.Pages) {
          for (let pageIdx = 0; pageIdx < pdfData.Pages.length; pageIdx++) {
            const page = pdfData.Pages[pageIdx];
            let pageText = "";

            if (page.Texts) {
              console.log(
                `[extractPDFText] Page ${pageIdx + 1}: ${page.Texts.length} text elements`,
              );

              for (const text of page.Texts) {
                if (text.R) {
                  for (const run of text.R) {
                    if (run.T) {
                      try {
                        const decoded = decodeURIComponent(run.T);
                        pageText += decoded + " ";
                      } catch (decodeError) {
                        console.warn(
                          `[extractPDFText] Failed to decode text on page ${pageIdx + 1}:`,
                          run.T,
                        );
                        pageText += run.T + " ";
                      }
                    }
                  }
                }
              }
            } else {
              console.log(
                `[extractPDFText] Page ${pageIdx + 1}: No text elements found`,
              );
            }

            fullText += pageText + "\n";
            if (pageIdx < 5 || pageIdx === pdfData.Pages.length - 1) {
              console.log(
                `[extractPDFText] Page ${pageIdx + 1} extracted: ${pageText.length} characters`,
              );
            }
          }
        } else {
          console.warn("[extractPDFText] No pages found in PDF data");
        }

        console.log(
          "[extractPDFText] Total extracted text length:",
          fullText.length,
        );
        console.log(
          "[extractPDFText] First 200 chars:",
          fullText.substring(0, 200),
        );
        resolve(fullText);
      } catch (err) {
        console.error("[extractPDFText] Error in dataReady handler:", err);
        reject(err);
      }
    });

    pdfParser.loadPDF(filePath);
  });
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
