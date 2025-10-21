"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface QualityDashboard {
  total_queries: number;
  avg_chunks_retrieved: number;
  avg_similarity_score: number;
  avg_response_length: number;
  refusal_count: number;
  refusal_rate: number;
  thumbs_up_count: number;
  thumbs_down_count: number;
  feedback_rate: number;
  avg_feedback_score: number;
  avg_latency_ms: number;
  total_tokens: number;
}

interface ProblemQuery {
  id: string;
  query_text: string;
  response_text: string;
  chunks_retrieved: number;
  avg_similarity: number;
  user_feedback: number | null;
  feedback_comment: string | null;
  contained_refusal: boolean;
  created_at: string;
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [problemQueries, setProblemQueries] = useState<ProblemQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch dashboard summary
      const { data: dashboardData } = await supabase
        .from("quality_dashboard")
        .select("*")
        .eq("company_id", user.id)
        .single();

      setDashboard(dashboardData);

      // Fetch problem queries
      const { data: problems } = await supabase
        .from("problem_queries")
        .select("*")
        .eq("company_id", user.id)
        .limit(20);

      setProblemQueries(problems || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Response Quality Analytics</h1>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Total Queries"
            value={dashboard?.total_queries || 0}
            format="number"
          />
          <MetricCard
            title="Avg Similarity"
            value={dashboard?.avg_similarity_score || 0}
            format="percentage"
          />
          <MetricCard
            title="Refusal Rate"
            value={dashboard?.refusal_rate || 0}
            format="percentage"
            warning={dashboard?.refusal_rate && dashboard.refusal_rate > 0.2}
          />
          <MetricCard
            title="Thumbs Up Rate"
            value={
              dashboard?.thumbs_up_count && dashboard?.feedback_rate
                ? dashboard.thumbs_up_count /
                  (dashboard.total_queries * dashboard.feedback_rate)
                : 0
            }
            format="percentage"
          />
        </div>

        {/* Detailed Metrics */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Detailed Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Metric
              label="Avg Chunks Retrieved"
              value={dashboard?.avg_chunks_retrieved?.toFixed(1) || "0"}
            />
            <Metric
              label="Avg Response Length"
              value={`${dashboard?.avg_response_length?.toFixed(0) || "0"} chars`}
            />
            <Metric
              label="Avg Latency"
              value={`${dashboard?.avg_latency_ms?.toFixed(0) || "0"} ms`}
            />
            <Metric
              label="Total Tokens Used"
              value={dashboard?.total_tokens?.toLocaleString() || "0"}
            />
            <Metric
              label="Feedback Given"
              value={`${((dashboard?.feedback_rate || 0) * 100).toFixed(1)}%`}
            />
            <Metric
              label="Avg Feedback Score"
              value={dashboard?.avg_feedback_score?.toFixed(2) || "N/A"}
            />
          </div>
        </div>

        {/* Problem Queries */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Problem Queries ({problemQueries.length})
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Queries with negative feedback, refusals, or no results
          </p>

          <div className="space-y-4">
            {problemQueries.map((query) => (
              <div
                key={query.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {query.query_text}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {query.response_text}
                    </p>
                  </div>
                  <div className="ml-4 flex gap-2">
                    {query.contained_refusal && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                        Refusal
                      </span>
                    )}
                    {query.user_feedback === -1 && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                        👎
                      </span>
                    )}
                    {query.chunks_retrieved === 0 && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                        No chunks
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-gray-500 mt-2">
                  <span>Chunks: {query.chunks_retrieved}</span>
                  <span>
                    Similarity:{" "}
                    {query.avg_similarity
                      ? (query.avg_similarity * 100).toFixed(1) + "%"
                      : "N/A"}
                  </span>
                  <span>
                    {new Date(query.created_at).toLocaleDateString()}
                  </span>
                </div>

                {query.feedback_comment && (
                  <p className="text-sm text-gray-700 mt-2 italic">
                    "{query.feedback_comment}"
                  </p>
                )}
              </div>
            ))}

            {problemQueries.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                No problem queries found. Great job! 🎉
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  format = "number",
  warning = false,
}: {
  title: string;
  value: number;
  format?: "number" | "percentage";
  warning?: boolean;
}) {
  const displayValue =
    format === "percentage"
      ? `${(value * 100).toFixed(1)}%`
      : value.toLocaleString();

  return (
    <div
      className={`bg-white rounded-lg shadow p-6 ${warning ? "border-2 border-red-300" : ""}`}
    >
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${warning ? "text-red-600" : ""}`}>
        {displayValue}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
