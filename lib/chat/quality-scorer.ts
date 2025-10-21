import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface QualityScores {
  relevance: number;      // 0-1: Does the answer address the question?
  completeness: number;   // 0-1: Is the answer complete and thorough?
  accuracy: number;       // 0-1: Is the answer faithful to the context?
  coherence: number;      // 0-1: Is the answer well-structured and clear?
  overall: number;        // 0-1: Average of all scores
  reasoning: string;      // Explanation of the scores
}

/**
 * Use GPT-4 as a judge to evaluate response quality
 * This is the gold standard for automated evaluation
 */
export async function scoreResponseWithGPT4(
  query: string,
  context: string,
  response: string
): Promise<QualityScores> {
  const scoringPrompt = `You are an expert evaluator assessing the quality of AI-generated responses in a RAG (Retrieval-Augmented Generation) system.

Evaluate the following response based on these criteria:

1. **Relevance** (0-1): Does the response directly address the user's question?
2. **Completeness** (0-1): Does the response fully answer the question, or is it partial/incomplete?
3. **Accuracy** (0-1): Is the response factually correct and faithful to the provided context? Does it avoid hallucination?
4. **Coherence** (0-1): Is the response well-structured, clear, and easy to understand?

**User Question:**
${query}

**Context Provided:**
${context.substring(0, 4000)} ${context.length > 4000 ? '...[truncated]' : ''}

**AI Response:**
${response}

Provide your evaluation as a JSON object with the following structure:
{
  "relevance": 0.0-1.0,
  "completeness": 0.0-1.0,
  "accuracy": 0.0-1.0,
  "coherence": 0.0-1.0,
  "reasoning": "Brief explanation of your scores (2-3 sentences)"
}

Be strict but fair. A score of 1.0 should be reserved for excellent responses. Average responses should score around 0.6-0.7.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // or "gpt-4o" for latest
      messages: [
        {
          role: "system",
          content: "You are an expert evaluator. Provide objective, consistent scores. Always respond with valid JSON."
        },
        {
          role: "user",
          content: scoringPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0, // Deterministic scoring
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    
    // Calculate overall score as average
    const overall = (
      result.relevance + 
      result.completeness + 
      result.accuracy + 
      result.coherence
    ) / 4;

    return {
      relevance: result.relevance,
      completeness: result.completeness,
      accuracy: result.accuracy,
      coherence: result.coherence,
      overall,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error("[scoreResponseWithGPT4] Error:", error);
    throw error;
  }
}

/**
 * Faster, cheaper alternative using GPT-3.5
 * Good for high-volume batch scoring
 */
export async function scoreResponseWithGPT35(
  query: string,
  context: string,
  response: string
): Promise<QualityScores> {
  const scoringPrompt = `Rate this AI response (0-1 scale):

Question: ${query}
Context: ${context.substring(0, 2000)}
Response: ${response}

JSON format:
{
  "relevance": 0.0-1.0,
  "completeness": 0.0-1.0,
  "accuracy": 0.0-1.0,
  "coherence": 0.0-1.0,
  "reasoning": "1-2 sentences"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an evaluator. Respond only with valid JSON."
        },
        {
          role: "user",
          content: scoringPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    
    const overall = (
      result.relevance + 
      result.completeness + 
      result.accuracy + 
      result.coherence
    ) / 4;

    return {
      relevance: result.relevance,
      completeness: result.completeness,
      accuracy: result.accuracy,
      coherence: result.coherence,
      overall,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error("[scoreResponseWithGPT35] Error:", error);
    throw error;
  }
}

/**
 * Heuristic-based scoring (fast, free, but less accurate)
 * Good for real-time scoring in production
 */
export function scoreResponseHeuristic(
  query: string,
  context: string,
  response: string,
  chunksRetrieved: number,
  avgSimilarity: number
): QualityScores {
  let relevance = 0.5;
  let completeness = 0.5;
  let accuracy = 0.5;
  let coherence = 0.5;
  let reasoning = "";

  // Relevance: Based on retrieval quality
  if (avgSimilarity >= 0.8) relevance = 0.9;
  else if (avgSimilarity >= 0.7) relevance = 0.75;
  else if (avgSimilarity >= 0.6) relevance = 0.6;
  else relevance = 0.4;

  // Penalize if no chunks were retrieved
  if (chunksRetrieved === 0) relevance = 0.2;

  // Accuracy: Check for refusal phrases (indicates couldn't find answer)
  const refusalPhrases = [
    'does not contain',
    "I don't have",
    'cannot find',
    'no information',
    "I'm sorry",
  ];
  const hasRefusal = refusalPhrases.some(phrase => 
    response.toLowerCase().includes(phrase.toLowerCase())
  );

  if (hasRefusal) {
    accuracy = 0.3;
    completeness = 0.2;
    reasoning = "Response indicates information not found in context.";
  } else {
    accuracy = 0.7;
    completeness = 0.7;
  }

  // Completeness: Based on response length (very rough heuristic)
  if (response.length < 100) completeness *= 0.6; // Too short
  else if (response.length > 1500) completeness *= 0.8; // Might be verbose/hallucinating

  // Coherence: Check basic structure
  const hasPunctuation = /[.!?]/.test(response);
  const hasCapitalization = /[A-Z]/.test(response);
  coherence = hasPunctuation && hasCapitalization ? 0.7 : 0.5;

  // Check if response uses context (rough check)
  const contextWords = context.toLowerCase().split(/\s+/).slice(0, 100);
  const responseWords = response.toLowerCase().split(/\s+/);
  const contextOverlap = contextWords.filter(word => 
    word.length > 4 && responseWords.includes(word)
  ).length;
  
  if (contextOverlap > 10) {
    accuracy = Math.min(1.0, accuracy + 0.2);
  }

  const overall = (relevance + completeness + accuracy + coherence) / 4;

  if (!reasoning) {
    reasoning = `Heuristic scoring: ${chunksRetrieved} chunks, ${(avgSimilarity * 100).toFixed(0)}% similarity, ${response.length} chars.`;
  }

  return {
    relevance,
    completeness,
    accuracy,
    coherence,
    overall,
    reasoning,
  };
}

/**
 * Main scoring function - chooses method based on configuration
 */
export async function scoreResponse(
  query: string,
  context: string,
  response: string,
  chunksRetrieved: number,
  avgSimilarity: number,
  method: 'gpt4' | 'gpt3.5' | 'heuristic' = 'heuristic'
): Promise<QualityScores & { method: string }> {
  let scores: QualityScores;

  switch (method) {
    case 'gpt4':
      scores = await scoreResponseWithGPT4(query, context, response);
      break;
    case 'gpt3.5':
      scores = await scoreResponseWithGPT35(query, context, response);
      break;
    case 'heuristic':
    default:
      scores = scoreResponseHeuristic(query, context, response, chunksRetrieved, avgSimilarity);
      break;
  }

  return {
    ...scores,
    method,
  };
}
