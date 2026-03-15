"use client";

import { useState, useEffect, useCallback } from "react";
import { Spin, Empty, Tag, Collapse, Progress, Divider } from "antd";
import {
  UserOutlined,
  GithubOutlined,
  CodeOutlined,
  FileTextOutlined,
  WarningOutlined,
  TrophyOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";
import { getCandidates, getCandidateReport } from "@/lib/api";
import type { CandidateReport } from "@/lib/api";
import type { Candidate } from "@/lib/types";

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
  }
  const pct = Math.round(score);
  const color = pct >= 70 ? "#15803d" : pct >= 40 ? "#854d0e" : "#b91c1c";
  const bg = pct >= 70 ? "rgba(34,197,94,0.10)" : pct >= 40 ? "rgba(234,179,8,0.10)" : "rgba(239,68,68,0.10)";
  return (
    <Tag style={{ background: bg, border: "none", color, borderRadius: 999, fontWeight: 700, fontSize: 12 }}>
      {pct}%
    </Tag>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <span style={{ color: "#2563eb", fontSize: 14 }}>{icon}</span>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {text}
      </span>
    </div>
  );
}

// ─── Full candidate report panel ──────────────────────────────────────────────

function CandidateReportPanel({ candidateId }: { candidateId: number }) {
  const [report, setReport] = useState<CandidateReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCandidateReport(candidateId)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) return <div style={{ padding: "24px 0", textAlign: "center" }}><Spin size="small" /></div>;
  if (!report) return <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 16 }}>No report data available.</div>;

  const { session, github, assessments } = report;

  // Session status label + colour
  const statusLabel: Record<string, string> = {
    terminated_success: "High Confidence",
    terminated_fail: "Insufficient Proficiency",
    terminated_limit: "Session Limit Reached",
    active: "In Progress",
  };
  const statusColor: Record<string, string> = {
    terminated_success: "#15803d",
    terminated_fail: "#b91c1c",
    terminated_limit: "#854d0e",
    active: "#1d4ed8",
  };
  const sessionStatus = session.status ?? "active";
  const confidence = session.confidence ?? 0;
  const progressColor = confidence >= 70 ? "#22c55e" : confidence >= 40 ? "#eab308" : "#ef4444";

  // Parse matched_repos JSON for language lookup
  let matchedReposMeta: { repo_name: string; language?: string; matched_claim?: string }[] = [];
  try {
    matchedReposMeta = JSON.parse(github.matched_repos || "[]");
  } catch { /* ignore */ }

  // Parse GitHub verification summary into structured blocks
  const ghBlocks = github.verification_summary
    ? github.verification_summary.split(/\n\n---\n\n/).map((block) => {
        const repoMatch = block.match(/Repo:\s*([^\|]+)/);
        const claimMatch = block.match(/Claim:\s*([^\|]+)/);
        const alignMatch = block.match(/Alignment:\s*(\w+)/);
        const seniorityMatch = block.match(/Seniority:\s*([^\n]+Red flags:|[^\n]+$)/s);
        const redFlagsMatch = block.match(/Red flags:\s*(.+)$/s);
        const repoName = repoMatch?.[1]?.trim() ?? "";
        const language = matchedReposMeta.find((r) => r.repo_name === repoName)?.language ?? "";
        return {
          repo: repoName,
          claim: claimMatch?.[1]?.trim() ?? "",
          alignment: alignMatch?.[1]?.trim() ?? "",
          seniority: seniorityMatch?.[1]?.replace(/Red flags:.*/s, "").trim() ?? "",
          redFlags: redFlagsMatch?.[1]?.trim() ?? "",
          language,
          raw: block,
        };
      })
    : [];

  const scoredAssessments = assessments.filter((a) => a.score !== null);
  const avgScore = scoredAssessments.length
    ? Math.round(scoredAssessments.reduce((s, a) => s + (a.score ?? 0), 0) / scoredAssessments.length)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0 16px" }}>

      {/* ── Confidence + session outcome ── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 180,
            background: "rgba(239,246,255,0.6)",
            border: "1px solid rgba(37,99,235,0.12)",
            borderRadius: 14,
            padding: "16px 20px",
          }}
        >
          <SectionLabel icon={<TrophyOutlined />} text="Confidence Score" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: progressColor, lineHeight: 1 }}>
              {Math.round(confidence)}%
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
              over {session.question_count} questions
            </span>
          </div>
          <Progress
            percent={Math.round(confidence)}
            showInfo={false}
            strokeColor={progressColor}
            trailColor="rgba(37,99,235,0.08)"
            strokeWidth={6}
          />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 180,
            background: "rgba(239,246,255,0.6)",
            border: "1px solid rgba(37,99,235,0.12)",
            borderRadius: 14,
            padding: "16px 20px",
          }}
        >
          <SectionLabel icon={<UserOutlined />} text="Session Outcome" />
          <div style={{ marginBottom: 6 }}>
            <Tag
              style={{
                background: `${statusColor[sessionStatus]}18`,
                border: "none",
                color: statusColor[sessionStatus] ?? "#1d4ed8",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 12,
                padding: "3px 12px",
              }}
            >
              {statusLabel[sessionStatus] ?? sessionStatus}
            </Tag>
          </div>
          {avgScore !== null && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              Avg answer score: <b style={{ color: "var(--text-primary)" }}>{avgScore}%</b>
            </div>
          )}
        </div>
      </div>

      {/* ── GitHub code evaluation ── */}
      {!github.skipped && github.verification_summary && (
        <div>
          <SectionLabel icon={<GithubOutlined />} text="Code Evaluation (GitHub)" />
          {ghBlocks.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ghBlocks.map((b, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(37,99,235,0.12)",
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  {b.repo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <GithubOutlined style={{ color: "#2563eb", fontSize: 13 }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{b.repo}</span>
                      {b.language && <Tag style={{ background: "rgba(124,58,237,0.08)", border: "none", color: "#7c3aed", borderRadius: 999, fontSize: 11, fontFamily: "monospace" }}>{b.language}</Tag>}
                      {b.claim && <Tag style={{ background: "rgba(37,99,235,0.08)", border: "none", color: "#1d4ed8", borderRadius: 999, fontSize: 11 }}>{b.claim}</Tag>}
                      {b.alignment && (
                        <Tag
                          style={{
                            background: b.alignment === "strong" ? "rgba(34,197,94,0.10)" : b.alignment === "partial" ? "rgba(234,179,8,0.10)" : "rgba(239,68,68,0.10)",
                            border: "none",
                            color: b.alignment === "strong" ? "#15803d" : b.alignment === "partial" ? "#854d0e" : "#b91c1c",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {b.alignment}
                        </Tag>
                      )}
                    </div>
                  )}
                  {b.seniority && (
                    <div style={{ marginBottom: 6 }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Seniority</span>
                      <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-body)", lineHeight: 1.5 }}>{b.seniority}</p>
                    </div>
                  )}
                  {b.redFlags && b.redFlags !== "None" && (
                    <div>
                      <span className="mono" style={{ fontSize: 10, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        <WarningOutlined style={{ marginRight: 4 }} />Red Flags
                      </span>
                      <p style={{ margin: "3px 0 0", fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>{b.redFlags}</p>
                    </div>
                  )}
                  {!b.repo && (
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-body)", whiteSpace: "pre-wrap" }}>{b.raw}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-body)", whiteSpace: "pre-wrap", margin: 0 }}>
              {github.verification_summary}
            </p>
          )}
        </div>
      )}

      {/* ── AI final report (Strengths / Weaknesses / Recommendation) ── */}
      {session.final_report && (
        <div>
          <SectionLabel icon={<FileTextOutlined />} text="AI Assessment Report" />
          <div
            style={{
              background: "rgba(239,246,255,0.5)",
              border: "1px solid rgba(37,99,235,0.1)",
              borderRadius: 12,
              padding: "16px 20px",
              fontSize: 13,
              color: "var(--text-body)",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            {/* Strip the raw transcript header, show from Strengths onwards */}
            {session.final_report.includes("## Strengths")
              ? session.final_report.slice(session.final_report.indexOf("## Strengths"))
              : session.final_report}
          </div>
        </div>
      )}

      {/* ── Q&A transcript ── */}
      {assessments.length > 0 && (
        <div>
          <SectionLabel icon={<CodeOutlined />} text={`Q&A Transcript (${assessments.length} questions)`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assessments.map((a, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.70)",
                  border: "1px solid rgba(37,99,235,0.10)",
                  borderRadius: 12,
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>Q{a.question_number ?? i + 1}</span>
                  <Tag style={{ background: "rgba(37,99,235,0.08)", border: "none", color: "#1d4ed8", borderRadius: 999, fontSize: 10 }}>{a.question_type}</Tag>
                  <Tag style={{ background: a.source === "github" ? "rgba(37,99,235,0.08)" : "rgba(139,92,246,0.08)", border: "none", color: a.source === "github" ? "#1d4ed8" : "#7c3aed", borderRadius: 999, fontSize: 10 }}>
                    {a.source === "github" ? "Code" : "PDF"}
                  </Tag>
                  <ScoreBadge score={a.score} />
                </div>
                <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {a.question_text}
                </p>
                {a.user_answer ? (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-body)", lineHeight: 1.4 }}>
                    <b>Answer:</b> {a.user_answer}
                  </p>
                ) : (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No answer / timeout</p>
                )}
                {a.feedback && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                    <b>Feedback:</b> {a.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {assessments.length === 0 && !session.final_report && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: "var(--text-muted)", fontSize: 13 }}>Assessment not yet completed</span>} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CandidateReportsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCandidates(await getCandidates());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const collapseItems = candidates.map((c) => {
    const avgScore = c.average_score !== null ? Math.round(c.average_score) : null;
    return {
      key: String(c.id),
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(37,99,235,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UserOutlined style={{ color: "#2563eb", fontSize: 14 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.email}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {c.claims.slice(0, 3).map((cl) => (
              <Tag key={cl.id} style={{ background: "rgba(37,99,235,0.06)", border: "none", color: "#1d4ed8", borderRadius: 999, fontSize: 11 }}>
                {cl.skill_name}
              </Tag>
            ))}
            {c.claims.length > 3 && (
              <Tag style={{ background: "rgba(37,99,235,0.06)", border: "none", color: "var(--text-muted)", borderRadius: 999, fontSize: 11 }}>
                +{c.claims.length - 3}
              </Tag>
            )}
            {avgScore !== null && <ScoreBadge score={avgScore} />}
          </div>
        </div>
      ),
      children: <CandidateReportPanel candidateId={c.id} />,
    };
  });

  return (
    <div style={{ padding: "48px 40px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0, marginBottom: 6 }}>
            Candidate Reports
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Click a candidate to view their full evaluation — confidence score, code audit, and Q&A transcript.
          </p>
        </div>
        <button
          onClick={load}
          style={{ background: "none", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: "#1d4ed8", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
        >
          <ReloadOutlined /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "64px 0" }}><Spin size="default" /></div>
      ) : candidates.length === 0 ? (
        <GlassCard variant="elevated" style={{ padding: 40 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: "var(--text-muted)" }}>No candidates yet</span>} />
        </GlassCard>
      ) : (
        <GlassCard variant="elevated" style={{ padding: 0, overflow: "hidden" }}>
          <Collapse
            accordion
            ghost
            items={collapseItems}
            style={{ background: "transparent" }}
          />
        </GlassCard>
      )}
    </div>
  );
}
