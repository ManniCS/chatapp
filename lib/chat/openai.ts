import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // OpenAI allows up to 2048 inputs per request
    const BATCH_SIZE = 2048;
    const allEmbeddings: number[][] = [];

    // Process in batches if needed
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      console.log(
        `[generateEmbeddings] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, size: ${batch.length}`,
      );

      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch,
      });

      // Extract embeddings in order
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  } catch (error) {
    console.error("Error generating batch embeddings:", error);
    throw error;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function chat(messages: Array<{ role: string; content: string }>) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
}
