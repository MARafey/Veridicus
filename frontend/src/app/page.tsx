"use client";

import { useEffect, useState } from "react";
import { Typography, Button, Tag, Spin, Empty } from "antd";
import { PlusOutlined, GithubOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { getCandidates, getGitHubVerification } from "@/lib/api";
import type { Candidate, GitHubVerification } from "@/lib/types";
import GlassCard from "@/components/GlassCard";

const { Title, Text } = Typography;

function scoreColor(score: number): string {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "error";
}

export default function Dashboard() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [githubMap, setGithubMap] = useState<Record<number, GitHubVerification | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCandidates().then(async (cands) => {
      setCandidates(cands);
      const entries = await Promise.all(
        cands.map(async (c) => {
          const gh = await getGitHubVerification(c.id).catch(() => null);
          return [c.id, gh] as [number, GitHubVerification | null];
        })
      );
      setGithubMap(Object.fromEntries(entries));
    }).finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
        <div>
          <Title
            level={1}
            style={{ color: "var(--text-primary)", margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.02em" }}
          >
            Veridicus
          </Title>
          <span
            className="mono"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}
          >
            resume · authentication · system
          </span>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => router.push("/upload")}
        >
          New Assessment
        </Button>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: "block", margin: "80px auto" }} />
      ) : candidates.length === 0 ? (
        <GlassCard style={{ padding: 48 }}>
          <Empty
            description={<span style={{ color: "var(--text-muted)" }}>No assessments yet</span>}
          />
        </GlassCard>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {candidates.map((c) => (
            <GlassCard key={c.id} className="stagger-item" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <Title level={4} style={{ color: "var(--text-primary)", margin: 0 }}>{c.name}</Title>
                  <Text style={{ color: "var(--text-muted)" }}>{c.email}</Text>
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {c.claims.map((cl) => (
                      <Tag key={cl.id} color="blue">{cl.skill_name}</Tag>
                    ))}
                  </div>
                  {/* Matched GitHub projects */}
                  {(() => {
                    const gh = githubMap[c.id];
                    if (!gh || gh.github_skipped || gh.matched_repos.length === 0) return null;
                    return (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <GithubOutlined style={{ color: "var(--text-muted)", fontSize: 12 }} />
                        {gh.matched_repos.map((repo) => (
                          <span
                            key={repo.repo_name}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              background: "rgba(37,99,235,0.06)",
                              border: "1px solid rgba(37,99,235,0.15)",
                              borderRadius: 999,
                              padding: "2px 10px",
                              fontSize: 11,
                              color: "#1d4ed8",
                              fontWeight: 600,
                            }}
                          >
                            {repo.repo_name}
                            {repo.language && (
                              <span style={{ fontFamily: "monospace", color: "#7c3aed", fontSize: 10 }}>
                                {repo.language}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                  {c.average_score !== null ? (
                    <>
                      <Tag color={scoreColor(c.average_score)} style={{ fontSize: 18, padding: "4px 12px" }}>
                        <span className="mono" style={{ fontWeight: 700 }}>{Math.round(c.average_score)}%</span>
                      </Tag>
                      <div>
                        <Text style={{ color: "var(--text-muted)", fontSize: 12 }}>avg score</Text>
                      </div>
                    </>
                  ) : (
                    <Tag color="default">Pending</Tag>
                  )}
                  <Button
                    type="link"
                    style={{ color: "#2563eb", padding: 0, marginTop: 8 }}
                    onClick={() => router.push(`/assessment/${c.id}`)}
                  >
                    View Assessment →
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </main>
  );
}
