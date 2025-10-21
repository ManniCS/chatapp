-- Enhanced analytics schema for response quality monitoring

-- Add quality metrics to existing query_analytics table
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS response_text TEXT;
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS response_length INTEGER;
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS contained_refusal BOOLEAN DEFAULT FALSE;
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS user_feedback INTEGER; -- 1 = thumbs up, -1 = thumbs down, null = no feedback
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS feedback_comment TEXT;
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS context_length INTEGER;
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS num_merged_chunks INTEGER;

-- Response quality scores (automated LLM-based evaluation)
CREATE TABLE IF NOT EXISTS response_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_analytics_id UUID NOT NULL REFERENCES query_analytics(id) ON DELETE CASCADE,
  
  -- Automated quality scores (0-1 scale)
  relevance_score FLOAT, -- How relevant is the answer to the question?
  completeness_score FLOAT, -- Does it fully answer the question?
  accuracy_score FLOAT, -- Is the information accurate based on context?
  coherence_score FLOAT, -- Is the response well-structured and clear?
  
  -- Overall quality score (average of above)
  overall_score FLOAT,
  
  -- Scoring method metadata
  scoring_method VARCHAR(50), -- 'llm-judge', 'heuristic', 'human'
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User interaction tracking
CREATE TABLE IF NOT EXISTS query_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_analytics_id UUID NOT NULL REFERENCES query_analytics(id) ON DELETE CASCADE,
  
  interaction_type VARCHAR(50) NOT NULL, -- 'reformulation', 'follow_up', 'new_topic', 'abandon'
  time_to_interaction_ms INTEGER, -- Time between response and next action
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A/B test tracking for prompt variations
CREATE TABLE IF NOT EXISTS prompt_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_name VARCHAR(100) NOT NULL,
  variant_name VARCHAR(50) NOT NULL, -- 'control', 'variant_a', etc.
  system_prompt TEXT NOT NULL,
  temperature FLOAT,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link queries to experiments
ALTER TABLE query_analytics ADD COLUMN IF NOT EXISTS prompt_experiment_id UUID REFERENCES prompt_experiments(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_response_quality_query ON response_quality_scores(query_analytics_id);
CREATE INDEX IF NOT EXISTS idx_query_interactions_query ON query_interactions(query_analytics_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_feedback ON query_analytics(user_feedback) WHERE user_feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_query_analytics_refusal ON query_analytics(contained_refusal) WHERE contained_refusal = TRUE;

-- RLS Policies
ALTER TABLE response_quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quality scores for their queries"
  ON response_quality_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM query_analytics qa
      JOIN companies c ON c.id = qa.company_id
      WHERE qa.id = response_quality_scores.query_analytics_id
      AND c.id = auth.uid()
    )
  );

CREATE POLICY "Users can view interactions for their queries"
  ON query_interactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM query_analytics qa
      JOIN companies c ON c.id = qa.company_id
      WHERE qa.id = query_interactions.query_analytics_id
      AND c.id = auth.uid()
    )
  );

-- Enhanced analytics views
CREATE OR REPLACE VIEW quality_dashboard AS
SELECT 
  qa.company_id,
  COUNT(*) as total_queries,
  
  -- Retrieval metrics
  AVG(qa.chunks_retrieved) as avg_chunks_retrieved,
  AVG(qa.avg_similarity) as avg_similarity_score,
  AVG(qa.num_merged_chunks) as avg_merged_chunks,
  
  -- Response metrics
  AVG(qa.response_length) as avg_response_length,
  COUNT(CASE WHEN qa.contained_refusal = TRUE THEN 1 END) as refusal_count,
  COUNT(CASE WHEN qa.contained_refusal = TRUE THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) as refusal_rate,
  
  -- User feedback
  COUNT(CASE WHEN qa.user_feedback = 1 THEN 1 END) as thumbs_up_count,
  COUNT(CASE WHEN qa.user_feedback = -1 THEN 1 END) as thumbs_down_count,
  COUNT(CASE WHEN qa.user_feedback IS NOT NULL THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) as feedback_rate,
  AVG(CASE WHEN qa.user_feedback IS NOT NULL THEN qa.user_feedback END) as avg_feedback_score,
  
  -- Quality scores
  AVG(rqs.overall_score) as avg_quality_score,
  AVG(rqs.relevance_score) as avg_relevance,
  AVG(rqs.completeness_score) as avg_completeness,
  AVG(rqs.accuracy_score) as avg_accuracy,
  
  -- Performance
  AVG(qa.latency_ms) as avg_latency_ms,
  SUM(qa.openai_prompt_tokens + qa.openai_completion_tokens) as total_tokens,
  
  -- Time range
  MIN(qa.created_at) as first_query,
  MAX(qa.created_at) as last_query
FROM query_analytics qa
LEFT JOIN response_quality_scores rqs ON rqs.query_analytics_id = qa.id
GROUP BY qa.company_id;

-- Problem queries view (low quality or negative feedback)
CREATE OR REPLACE VIEW problem_queries AS
SELECT 
  qa.id,
  qa.company_id,
  qa.query_text,
  qa.response_text,
  qa.chunks_retrieved,
  qa.avg_similarity,
  qa.user_feedback,
  qa.feedback_comment,
  qa.contained_refusal,
  rqs.overall_score,
  qa.created_at
FROM query_analytics qa
LEFT JOIN response_quality_scores rqs ON rqs.query_analytics_id = qa.id
WHERE 
  qa.user_feedback = -1 -- Thumbs down
  OR qa.contained_refusal = TRUE -- LLM refused to answer
  OR qa.chunks_retrieved = 0 -- No chunks found
  OR rqs.overall_score < 0.5 -- Low quality score
ORDER BY qa.created_at DESC;

-- Query performance over time (for trend analysis)
CREATE OR REPLACE VIEW quality_trends AS
SELECT 
  DATE_TRUNC('day', qa.created_at) as date,
  qa.company_id,
  COUNT(*) as query_count,
  AVG(qa.avg_similarity) as avg_similarity,
  AVG(rqs.overall_score) as avg_quality_score,
  COUNT(CASE WHEN qa.user_feedback = 1 THEN 1 END)::FLOAT / NULLIF(COUNT(CASE WHEN qa.user_feedback IS NOT NULL THEN 1 END), 0) as thumbs_up_rate,
  AVG(qa.latency_ms) as avg_latency_ms
FROM query_analytics qa
LEFT JOIN response_quality_scores rqs ON rqs.query_analytics_id = qa.id
GROUP BY DATE_TRUNC('day', qa.created_at), qa.company_id
ORDER BY date DESC;

-- Functions to help with analysis

-- Detect if response contains refusal phrases
CREATE OR REPLACE FUNCTION detect_refusal(response_text TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    response_text ILIKE '%does not contain%' OR
    response_text ILIKE '%I don''t have%' OR
    response_text ILIKE '%cannot find%' OR
    response_text ILIKE '%no information%' OR
    response_text ILIKE '%I''m sorry%context%'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
