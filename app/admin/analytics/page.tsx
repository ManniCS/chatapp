'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './analytics.module.css';

interface AnalyticsSummary {
  totalQueries: number;
  avgSimilarity: number;
  avgLatency: number;
  queriesWithNoResults: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCost: number;
}

interface TopQuery {
  query_text: string;
  count: number;
  avg_similarity: number;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [topQueries, setTopQueries] = useState<TopQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      const supabase = createClient();
      
      // Get current user's company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyData } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!companyData) return;
      setCompanyId(companyData.id);

      // Fetch analytics summary
      const { data: analytics } = await supabase
        .from('query_analytics')
        .select('*')
        .eq('company_id', companyData.id);

      if (analytics && analytics.length > 0) {
        const totalQueries = analytics.length;
        const avgSimilarity = analytics.reduce((sum, a) => sum + (a.avg_similarity || 0), 0) / totalQueries;
        const avgLatency = analytics.reduce((sum, a) => sum + (a.latency_ms || 0), 0) / totalQueries;
        const queriesWithNoResults = analytics.filter(a => a.chunks_retrieved === 0).length;
        const totalPromptTokens = analytics.reduce((sum, a) => sum + (a.openai_prompt_tokens || 0), 0);
        const totalCompletionTokens = analytics.reduce((sum, a) => sum + (a.openai_completion_tokens || 0), 0);
        
        // OpenAI pricing (GPT-3.5 Turbo): $0.0015 per 1K prompt tokens, $0.002 per 1K completion tokens
        const estimatedCost = (totalPromptTokens / 1000) * 0.0015 + (totalCompletionTokens / 1000) * 0.002;

        setSummary({
          totalQueries,
          avgSimilarity,
          avgLatency,
          queriesWithNoResults,
          totalPromptTokens,
          totalCompletionTokens,
          estimatedCost,
        });

        // Calculate top queries
        const queryMap = new Map<string, { count: number; totalSimilarity: number }>();
        analytics.forEach(a => {
          const existing = queryMap.get(a.query_text) || { count: 0, totalSimilarity: 0 };
          queryMap.set(a.query_text, {
            count: existing.count + 1,
            totalSimilarity: existing.totalSimilarity + (a.avg_similarity || 0),
          });
        });

        const topQueriesData: TopQuery[] = Array.from(queryMap.entries())
          .map(([query_text, data]) => ({
            query_text,
            count: data.count,
            avg_similarity: data.totalSimilarity / data.count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setTopQueries(topQueriesData);
      }

      setLoading(false);
    }

    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <h1>Analytics Dashboard</h1>
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={styles.container}>
        <h1>Analytics Dashboard</h1>
        <p>No analytics data available yet. Start chatting to generate analytics!</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1>Analytics Dashboard</h1>

      <div className={styles.summaryGrid}>
        <div className={styles.card}>
          <h3>Total Queries</h3>
          <p className={styles.metric}>{summary.totalQueries}</p>
        </div>

        <div className={styles.card}>
          <h3>Avg Similarity Score</h3>
          <p className={styles.metric}>{summary.avgSimilarity.toFixed(3)}</p>
          <p className={styles.subtext}>Higher is better (0-1)</p>
        </div>

        <div className={styles.card}>
          <h3>Avg Response Time</h3>
          <p className={styles.metric}>{Math.round(summary.avgLatency)}ms</p>
        </div>

        <div className={styles.card}>
          <h3>Queries with No Results</h3>
          <p className={styles.metric}>{summary.queriesWithNoResults}</p>
          <p className={styles.subtext}>
            {summary.totalQueries > 0 
              ? `${((summary.queriesWithNoResults / summary.totalQueries) * 100).toFixed(1)}% of total`
              : '0%'}
          </p>
        </div>

        <div className={styles.card}>
          <h3>Total Tokens Used</h3>
          <p className={styles.metric}>
            {(summary.totalPromptTokens + summary.totalCompletionTokens).toLocaleString()}
          </p>
          <p className={styles.subtext}>
            Prompt: {summary.totalPromptTokens.toLocaleString()} | 
            Completion: {summary.totalCompletionTokens.toLocaleString()}
          </p>
        </div>

        <div className={styles.card}>
          <h3>Estimated Cost</h3>
          <p className={styles.metric}>${summary.estimatedCost.toFixed(4)}</p>
          <p className={styles.subtext}>Based on GPT-3.5 Turbo pricing</p>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Most Common Queries</h2>
        {topQueries.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Query</th>
                <th>Count</th>
                <th>Avg Similarity</th>
              </tr>
            </thead>
            <tbody>
              {topQueries.map((q, index) => (
                <tr key={index}>
                  <td className={styles.queryText}>{q.query_text}</td>
                  <td>{q.count}</td>
                  <td>{q.avg_similarity.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No query data available yet.</p>
        )}
      </div>
    </div>
  );
}
