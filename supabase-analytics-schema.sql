-- Add this to your Supabase SQL Editor to track analytics

-- Query analytics table
CREATE TABLE IF NOT EXISTS query_analytics (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  chunks_retrieved INTEGER DEFAULT 0,
  avg_similarity FLOAT,
  openai_prompt_tokens INTEGER DEFAULT 0,
  openai_completion_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track which chunks were used for each query
CREATE TABLE IF NOT EXISTS query_chunks (
  id UUID PRIMARY KEY,
  query_analytics_id UUID NOT NULL REFERENCES query_analytics(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL,
  chunk_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_query_analytics_company ON query_analytics(company_id);
CREATE INDEX IF NOT EXISTS idx_query_analytics_created ON query_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_chunks_query ON query_chunks(query_analytics_id);

-- RLS Policies
ALTER TABLE query_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_chunks ENABLE ROW LEVEL SECURITY;

-- Companies can view their own analytics
CREATE POLICY "Companies can view their own analytics"
  ON query_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = query_analytics.company_id
      AND companies.id = auth.uid()
    )
  );

CREATE POLICY "Companies can insert their own analytics"
  ON query_analytics FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = query_analytics.company_id
      AND companies.id = auth.uid()
    )
  );

-- Companies can view chunks for their queries
CREATE POLICY "Companies can view query chunks"
  ON query_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM query_analytics
      JOIN companies ON companies.id = query_analytics.company_id
      WHERE query_analytics.id = query_chunks.query_analytics_id
      AND companies.id = auth.uid()
    )
  );

CREATE POLICY "Companies can insert query chunks"
  ON query_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM query_analytics
      JOIN companies ON companies.id = query_analytics.company_id
      WHERE query_analytics.id = query_chunks.query_analytics_id
      AND companies.id = auth.uid()
    )
  );

-- Helpful views for the dashboard
CREATE OR REPLACE VIEW analytics_summary AS
SELECT 
  company_id,
  COUNT(*) as total_queries,
  AVG(chunks_retrieved) as avg_chunks_per_query,
  AVG(avg_similarity) as overall_avg_similarity,
  COUNT(CASE WHEN chunks_retrieved = 0 THEN 1 END) as queries_with_no_results,
  SUM(openai_prompt_tokens) as total_prompt_tokens,
  SUM(openai_completion_tokens) as total_completion_tokens,
  AVG(latency_ms) as avg_latency_ms
FROM query_analytics
GROUP BY company_id;

-- Most common queries
CREATE OR REPLACE VIEW popular_queries AS
SELECT 
  company_id,
  query_text,
  COUNT(*) as query_count,
  AVG(avg_similarity) as avg_similarity,
  AVG(chunks_retrieved) as avg_chunks
FROM query_analytics
GROUP BY company_id, query_text
ORDER BY query_count DESC;
