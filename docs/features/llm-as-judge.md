## LLM-as-Judge Implementation Guide

## Overview

LLM-as-Judge uses a powerful language model (like GPT-4) to evaluate the quality of your RAG system's responses. It's like having an expert human evaluator, but automated and scalable.

## Why LLM-as-Judge?

**Traditional Metrics** (BLEU, ROUGE) don't work well for RAG because:
- No single "correct" answer to compare against
- Focus on word overlap, not semantic quality
- Can't evaluate relevance, accuracy, or coherence

**LLM-as-Judge** evaluates like a human would:
- ✅ Is the answer relevant to the question?
- ✅ Is it complete and thorough?
- ✅ Is it accurate based on the context?
- ✅ Is it well-structured and clear?

## Three Scoring Methods

### 1. GPT-4 Judge (Best Quality, Highest Cost)

**Use for**: 
- Initial baseline evaluation
- Spot-checking critical queries
- Validating other methods

**Cost**: ~$0.01-0.03 per evaluation
**Speed**: 2-5 seconds per query

```typescript
// Score a single response
const scores = await scoreResponse(
  query,
  context,
  response,
  chunksRetrieved,
  avgSimilarity,
  'gpt4'
);
```

### 2. GPT-3.5 Judge (Good Quality, Lower Cost)

**Use for**:
- Regular batch scoring
- Development/testing
- High-volume evaluation

**Cost**: ~$0.001-0.002 per evaluation
**Speed**: 1-2 seconds per query

```typescript
const scores = await scoreResponse(
  query,
  context,
  response,
  chunksRetrieved,
  avgSimilarity,
  'gpt3.5'
);
```

### 3. Heuristic Scoring (Fast, Free)

**Use for**:
- Real-time production scoring
- Continuous monitoring
- Initial triage

**Cost**: Free
**Speed**: <10ms per query

```typescript
const scores = await scoreResponse(
  query,
  context,
  response,
  chunksRetrieved,
  avgSimilarity,
  'heuristic'
);
```

## Usage Patterns

### Pattern 1: Real-Time Auto-Scoring (Heuristic)

Enable in `.env.local`:
```bash
AUTO_SCORE_RESPONSES=true
```

Every chat response gets instantly scored with heuristics. No extra latency, no cost.

**Pros**: 
- Immediate feedback
- 100% coverage
- Free

**Cons**:
- Less accurate than LLM judges
- May miss nuanced quality issues

### Pattern 2: Batch Scoring (GPT-3.5)

Score all unscored queries nightly:

```bash
# Score last 100 unscored queries
curl -X POST http://localhost:3000/api/chat/score-batch \
  -H "Content-Type: application/json" \
  -d '{
    "method": "gpt3.5",
    "limit": 100,
    "onlyUnscored": true
  }'
```

**Pros**:
- Good quality scores
- Manageable cost
- Doesn't impact user latency

**Cons**:
- Delayed feedback
- Still costs money at scale

### Pattern 3: Selective GPT-4 Scoring

Score only problem queries with GPT-4:

```typescript
// Score queries with negative feedback or refusals
const { data: problemQueries } = await supabase
  .from("problem_queries")
  .select("id")
  .limit(20);

for (const query of problemQueries) {
  await fetch("/api/chat/score", {
    method: "POST",
    body: JSON.stringify({
      analyticsId: query.id,
      method: "gpt4"
    })
  });
}
```

**Pros**:
- Best quality where it matters
- Reasonable cost (only score problems)
- Helps debug issues

**Cons**:
- Manual process
- Not comprehensive

### Pattern 4: Hybrid Approach (Recommended)

1. **Heuristic** scores everything in real-time
2. **GPT-3.5** batch scores sample (10%) nightly
3. **GPT-4** spot-checks problem queries weekly

This gives you:
- Real-time monitoring (heuristic)
- Quality validation (GPT-3.5 sample)
- Deep insights (GPT-4 spot checks)

## Understanding the Scores

### Relevance (0-1)
**Question**: Does the response address what the user asked?

- **1.0**: Perfectly on-topic
- **0.7**: Mostly relevant, minor tangents
- **0.5**: Partially relevant
- **0.3**: Barely related
- **0.0**: Completely off-topic

### Completeness (0-1)
**Question**: Does it fully answer the question?

- **1.0**: Complete, thorough answer
- **0.7**: Covers main points, missing some details
- **0.5**: Partial answer
- **0.3**: Very incomplete
- **0.0**: Doesn't answer the question

### Accuracy (0-1)
**Question**: Is it faithful to the provided context?

- **1.0**: All facts are correct and sourced from context
- **0.7**: Mostly accurate, minor errors
- **0.5**: Some inaccuracies or unsupported claims
- **0.3**: Many errors or hallucinations
- **0.0**: Completely inaccurate

### Coherence (0-1)
**Question**: Is it well-written and clear?

- **1.0**: Excellent structure, very clear
- **0.7**: Good structure, easy to understand
- **0.5**: Acceptable but could be clearer
- **0.3**: Confusing or poorly structured
- **0.0**: Incoherent

### Overall
Average of all four scores.

**Interpretation**:
- **>0.8**: Excellent response
- **0.6-0.8**: Good response
- **0.4-0.6**: Mediocre, needs improvement
- **<0.4**: Poor response, investigate

## API Reference

### Score Single Query

```bash
POST /api/chat/score
{
  "analyticsId": "uuid",
  "method": "gpt4" | "gpt3.5" | "heuristic"
}
```

### Batch Score

```bash
POST /api/chat/score-batch
{
  "method": "gpt3.5",
  "limit": 50,
  "onlyUnscored": true,
  "since": "2025-01-01"
}
```

### Get Scores

```bash
GET /api/chat/score?analyticsId=uuid
```

## Cost Analysis

Assuming 1,000 queries/day:

| Method | Cost per Query | Daily Cost | Monthly Cost |
|--------|----------------|------------|--------------|
| Heuristic | $0 | $0 | $0 |
| GPT-3.5 | $0.002 | $2 | $60 |
| GPT-4 | $0.02 | $20 | $600 |

**Hybrid Strategy** (1000 queries/day):
- 100% heuristic (real-time): $0
- 10% GPT-3.5 (sample): $6/month
- 1% GPT-4 (problems): $6/month
- **Total**: ~$12/month for 30,000 queries

## Best Practices

### 1. Start with Heuristics

Enable auto-scoring with heuristics first:
```bash
AUTO_SCORE_RESPONSES=true
```

Monitor for 1 week, establish baselines.

### 2. Validate with LLM Sampling

Run weekly batch job:
```bash
# Score 100 random recent queries with GPT-3.5
POST /api/chat/score-batch
{
  "method": "gpt3.5",
  "limit": 100,
  "onlyUnscored": true
}
```

Compare heuristic vs GPT-3.5 scores to validate heuristic accuracy.

### 3. Deep Dive on Problems

When you see patterns in problem queries:
```sql
SELECT * FROM problem_queries 
WHERE overall_score < 0.4 
ORDER BY created_at DESC 
LIMIT 20;
```

Score these with GPT-4 for detailed reasoning:
```bash
POST /api/chat/score
{
  "analyticsId": "problem-query-id",
  "method": "gpt4"
}
```

### 4. Track Trends

Monitor score distribution over time:
```sql
SELECT 
  DATE(created_at) as date,
  AVG(overall_score) as avg_score,
  COUNT(*) as num_queries
FROM response_quality_scores
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 5. Set Alerts

```sql
-- Queries with GPT-4 scores < 0.5 (confirmed poor quality)
SELECT qa.query_text, rqs.overall_score, rqs.reasoning
FROM query_analytics qa
JOIN response_quality_scores rqs ON rqs.query_analytics_id = qa.id
WHERE rqs.scoring_method = 'gpt4'
  AND rqs.overall_score < 0.5
ORDER BY rqs.created_at DESC;
```

## Interpreting Results

### Scenario 1: Low Relevance, Good Accuracy
**Diagnosis**: Retrieved irrelevant chunks
**Fix**: 
- Lower similarity threshold
- Improve query embeddings
- Add query expansion/rewriting

### Scenario 2: Good Relevance, Low Accuracy
**Diagnosis**: LLM is hallucinating despite good context
**Fix**:
- Strengthen system prompt
- Lower temperature
- Add "cite sources" instruction

### Scenario 3: Good Accuracy, Low Completeness
**Diagnosis**: Context is relevant but incomplete
**Fix**:
- Increase number of chunks retrieved
- Larger chunk sizes
- Better chunking strategy

### Scenario 4: Everything Low
**Diagnosis**: Complete failure
**Fix**:
- Check document quality (OCR errors?)
- Re-process documents
- Review chunking + embedding strategy

## Advanced: Consensus Scoring

For critical queries, get consensus from multiple judges:

```typescript
const scores = await Promise.all([
  scoreResponse(query, context, response, chunks, sim, 'gpt4'),
  scoreResponse(query, context, response, chunks, sim, 'gpt3.5'),
  scoreResponse(query, context, response, chunks, sim, 'gpt3.5'), // 2nd opinion
]);

const avgOverall = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;
const variance = calculateVariance(scores.map(s => s.overall));

// High variance = judges disagree (ambiguous quality)
if (variance > 0.1) {
  console.log("Judges disagree - manual review needed");
}
```

## Limitations

1. **Not Perfect**: LLM judges can be wrong
2. **Expensive**: GPT-4 scoring at scale adds up
3. **Biased**: May prefer certain styles
4. **Slow**: GPT-4 adds 2-5s latency
5. **Temperature Sensitive**: Different prompts = different scores

## Conclusion

LLM-as-Judge provides scalable, automated quality evaluation that correlates well with human judgment. Start with heuristics, validate with GPT-3.5 sampling, and use GPT-4 for deep analysis of problem areas.

The key is finding the right balance between cost, speed, and quality for your use case.
