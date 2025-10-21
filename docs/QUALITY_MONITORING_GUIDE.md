# RAG Response Quality Monitoring - Best Practices Guide

## Overview

This guide covers best practices for monitoring and improving response quality in your RAG (Retrieval-Augmented Generation) system.

## Key Metrics to Track

### 1. Retrieval Quality Metrics

**Chunks Retrieved**
- **What**: Number of document chunks retrieved per query
- **Good range**: 3-10 chunks
- **Red flags**: 
  - 0 chunks = no relevant content found
  - >10 chunks = may be retrieving too much noise

**Average Similarity Score**
- **What**: Cosine similarity between query embedding and retrieved chunks
- **Good range**: 0.7-0.95
- **Red flags**:
  - <0.6 = poor relevance
  - >0.95 = may be retrieving exact duplicates

**Context Length**
- **What**: Total characters in merged context sent to LLM
- **Good range**: 2000-8000 characters
- **Red flags**:
  - <500 = insufficient context
  - >16000 = approaching token limits, high cost

### 2. Response Quality Metrics

**Refusal Rate**
- **What**: Percentage of responses where LLM says "I don't know"
- **Good range**: <10%
- **Red flags**: >20% indicates retrieval or prompt issues
- **How to improve**:
  - Lower similarity threshold
  - Improve system prompt (as you did)
  - Increase chunk overlap
  - Better chunking strategy

**Response Length**
- **What**: Average characters in LLM responses
- **Good range**: 200-800 characters
- **Red flags**:
  - <100 = incomplete answers
  - >1500 = verbose, may indicate hallucination

**User Feedback Rate**
- **What**: Percentage of users providing feedback
- **Good range**: >5%
- **How to improve**: Make feedback UI prominent and easy

**Thumbs Up/Down Ratio**
- **What**: Ratio of positive to negative feedback
- **Good range**: >70% positive
- **Action**: Investigate all thumbs-down queries

### 3. Performance Metrics

**Latency**
- **What**: Time from query to response
- **Good range**: <3 seconds
- **Components**:
  - Embedding generation: ~200ms
  - Vector search: ~100ms
  - LLM inference: 1-2s
  - Overhead: <500ms

**Token Usage**
- **What**: Prompt + completion tokens per query
- **Cost impact**: Directly affects OpenAI billing
- **Optimization**: Balance context length vs quality

## Best Practices

### 1. Continuous Monitoring

**Daily Checks**:
- Review refusal rate trends
- Check for spike in negative feedback
- Monitor average latency

**Weekly Analysis**:
- Review problem queries
- Identify common failure patterns
- Test prompt variations

**Monthly Review**:
- A/B test system prompts
- Re-evaluate chunk size/overlap
- Consider re-indexing documents

### 2. Quality Improvement Workflow

```
1. Identify Problem
   ↓
2. Categorize Issue
   - Retrieval (wrong chunks)
   - Context (fragmented/OCR errors)
   - Prompt (LLM interpretation)
   - Hallucination (LLM making things up)
   ↓
3. Apply Fix
   - Retrieval: Adjust similarity threshold
   - Context: Re-chunk with better settings
   - Prompt: Update system instructions
   - Hallucination: Strengthen "use only context" instruction
   ↓
4. A/B Test
   ↓
5. Measure Impact
   ↓
6. Deploy or Rollback
```

### 3. Problem Query Analysis

For each thumbs-down or refusal:

1. **Review Retrieved Chunks**
   - Were they relevant?
   - Was the information complete?
   - OCR quality issues?

2. **Review Context Construction**
   - Were chunks merged correctly?
   - Proper ordering?
   - Excessive fragmentation?

3. **Review LLM Response**
   - Did it use the context?
   - Hallucination?
   - Misinterpretation?

4. **Root Cause**
   - Document quality (OCR)
   - Chunking strategy
   - Retrieval parameters
   - System prompt
   - LLM temperature

### 4. Advanced Techniques

**LLM-as-Judge Scoring**:
```typescript
// Automatically score response quality using another LLM call
async function scoreResponse(query: string, context: string, response: string) {
  const scoringPrompt = `
    Rate the following AI response on a scale of 0-1 for:
    1. Relevance: Does it answer the question?
    2. Accuracy: Is it faithful to the context?
    3. Completeness: Does it fully address the query?
    4. Coherence: Is it well-structured?
    
    Query: ${query}
    Context: ${context}
    Response: ${response}
    
    Return JSON: {"relevance": 0.0-1.0, "accuracy": 0.0-1.0, ...}
  `;
  
  // Call LLM for scoring
  return await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: scoringPrompt }],
    response_format: { type: "json_object" }
  });
}
```

**Semantic Chunking**:
Instead of fixed-size chunks, split on:
- Paragraph boundaries
- Section headings
- Semantic similarity shifts

**Hybrid Search**:
Combine vector search with keyword search (BM25) for better retrieval.

**Query Rewriting**:
Before retrieval, expand or clarify the query using LLM.

**Context Compression**:
For long contexts, use LLM to summarize/compress before final inference.

## Alerting Thresholds

Set up alerts for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Refusal Rate | >25% | Immediate investigation |
| Avg Similarity | <0.65 | Review retrieval settings |
| Avg Latency | >5s | Check infrastructure |
| Thumbs Down Rate | >30% | Review recent changes |
| Zero Chunks Rate | >10% | Improve embeddings or lower threshold |

## SQL Queries for Analysis

**Find queries with good context but bad responses**:
```sql
SELECT 
  query_text,
  response_text,
  avg_similarity,
  chunks_retrieved,
  user_feedback
FROM query_analytics
WHERE avg_similarity > 0.8
  AND chunks_retrieved >= 3
  AND (user_feedback = -1 OR contained_refusal = TRUE)
ORDER BY created_at DESC
LIMIT 20;
```

**Identify best performing chunk ranges**:
```sql
SELECT 
  num_merged_chunks,
  COUNT(*) as query_count,
  AVG(CASE WHEN user_feedback = 1 THEN 1.0 ELSE 0.0 END) as thumbs_up_rate,
  AVG(CASE WHEN contained_refusal THEN 1.0 ELSE 0.0 END) as refusal_rate
FROM query_analytics
WHERE user_feedback IS NOT NULL
GROUP BY num_merged_chunks
ORDER BY thumbs_up_rate DESC;
```

**Track quality trends**:
```sql
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as queries,
  AVG(avg_similarity) as avg_sim,
  SUM(CASE WHEN user_feedback = 1 THEN 1 ELSE 0 END) as thumbs_up,
  SUM(CASE WHEN user_feedback = -1 THEN 1 ELSE 0 END) as thumbs_down,
  SUM(CASE WHEN contained_refusal THEN 1 ELSE 0 END) as refusals
FROM query_analytics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;
```

## Implementation Checklist

- [x] Capture retrieval metrics (chunks, similarity, latency)
- [x] Detect refusal responses automatically
- [x] Store full response text for analysis
- [x] Add user feedback mechanism (thumbs up/down)
- [x] Create analytics dashboard
- [ ] Implement LLM-as-judge scoring
- [ ] Set up automated alerts
- [ ] Create A/B testing framework
- [ ] Build query similarity clustering
- [ ] Add response caching for common queries

## Next Steps

1. **Deploy the schema**: Run `supabase-quality-metrics.sql`
2. **Add feedback UI**: Add thumbs up/down buttons to chat interface
3. **Review analytics**: Visit `/analytics` page daily
4. **Set baselines**: Track metrics for 1 week to establish norms
5. **Start iterating**: Use problem queries to guide improvements

## Resources

- [OpenAI Evaluation Best Practices](https://platform.openai.com/docs/guides/evaluation)
- [LangChain Evaluation](https://python.langchain.com/docs/guides/evaluation)
- [RAG Triad of Metrics](https://www.trulens.org/)
  - Context Relevance
  - Groundedness
  - Answer Relevance
