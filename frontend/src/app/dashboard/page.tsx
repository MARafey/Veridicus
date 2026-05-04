"use client";

import { useEffect, useState } from "react";
import {
  Typography, Button, Tag, Spin, Empty, Modal, Input, Statistic, Row, Col, Progress, Tabs,
} from "antd";
import {
  PlusOutlined, GithubOutlined, MailOutlined, LogoutOutlined, WarningOutlined, EyeOutlined, EditOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  getCandidates, getGitHubVerification, getOrgStats, sendInvites, listInvites, getInviteTemplate,
} from "@/lib/api";
import type { Candidate, GitHubVerification, OrgStats, SkillConfidence, Invitation } from "@/lib/types";
import GlassCard from "@/components/GlassCard";

const { Title, Text } = Typography;
const { TextArea } = Input;

function scoreColor(score: number): string {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "error";
}

function SkillMatrix({ skills }: { skills: SkillConfidence[] }) {
  if (!skills || skills.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
        Skill Confidence
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {skills.map((sc) => (
          <div key={sc.skill_name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 80 }}>{sc.skill_name}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${sc.confidence}%`,
                background: sc.confidence >= 85 ? "var(--success)" : sc.confidence >= 50 ? "var(--warning)" : "var(--blue-500)",
                transition: "width 0.5s ease", borderRadius: 999,
              }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 32, textAlign: "right" }}>
              {sc.confidence.toFixed(0)}%
            </span>
            <Tag color={sc.status === "evaluated" ? "success" : "processing"} style={{ fontSize: 10, margin: 0, lineHeight: "18px" }}>
              {sc.status === "evaluated" ? "Done" : "Active"}
            </Tag>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillHeatmap({ candidates }: { candidates: Candidate[] }) {
  const skillMap: Record<string, number[]> = {};
  for (const c of candidates) {
    for (const sc of c.skill_confidences ?? []) {
      if (!skillMap[sc.skill_name]) skillMap[sc.skill_name] = [];
      skillMap[sc.skill_name].push(sc.confidence);
    }
  }
  const entries = Object.entries(skillMap)
    .map(([name, vals]) => ({ name, avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }))
    .sort((a, b) => a.avg - b.avg);

  if (entries.length === 0) return null;

  return (
    <GlassCard style={{ padding: 24, marginBottom: 24 }}>
      <Title level={5} style={{ color: "var(--text-primary)", marginBottom: 16 }}>Skill Heatmap — Talent Pool</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map((e) => (
          <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ minWidth: 120, fontSize: 13, color: "var(--text-secondary)" }}>{e.name}</span>
            <Progress
              percent={Math.round(e.avg)}
              size="small"
              strokeColor={e.avg >= 75 ? "var(--success)" : e.avg >= 50 ? "var(--warning)" : "var(--error)"}
              style={{ flex: 1, marginBottom: 0 }}
            />
            <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 40 }}>
              {e.count} cand.
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function InviteStatusBadge({ email, invitations }: { email: string; invitations: Invitation[] }) {
  const inv = invitations.find((i) => i.candidate_email.toLowerCase() === email.toLowerCase());
  if (!inv) return null;
  const color = inv.status === "completed" ? "success" : inv.status === "started" ? "processing" : "default";
  return <Tag color={color} style={{ fontSize: 10, margin: 0 }}>{inv.status}</Tag>;
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [githubMap, setGithubMap] = useState<Record<number, GitHubVerification | null>>({});
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [inviteTab, setInviteTab] = useState("compose");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cands, orgStats, invites] = await Promise.all([
        getCandidates(),
        getOrgStats().catch(() => null),
        listInvites().catch(() => []),
      ]);
      setCandidates(cands);
      setStats(orgStats);
      setInvitations(invites);
      const entries = await Promise.all(
        cands.map(async (c) => {
          const gh = await getGitHubVerification(c.id).catch(() => null);
          return [c.id, gh] as [number, GitHubVerification | null];
        })
      );
      setGithubMap(Object.fromEntries(entries));
    } catch {
      setLoadError("Could not reach the backend. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openInviteModal = async () => {
    setInviteOpen(true);
    setInviteTab("compose");
    if (!templateLoaded) {
      try {
        const tpl = await getInviteTemplate();
        setEmailHtml(tpl.html);
        setEmailSubject(tpl.subject);
        setTemplateLoaded(true);
      } catch {
        // If fetch fails, leave fields empty — user can type their own
      }
    }
  };

  const handleSendInvites = async () => {
    const emails = inviteEmails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    if (!smtpUser || !smtpPassword) {
      setInviteResult("Please enter your email and app password.");
      return;
    }
    setInviteSending(true);
    try {
      const result = await sendInvites(emails, smtpUser, smtpPassword, {
        emailHtml: emailHtml || undefined,
        emailSubject: emailSubject || undefined,
      });
      setInviteResult(`✓ Sent ${result.sent} invite${result.sent !== 1 ? "s" : ""}`);
      setInviteEmails("");
      load();
    } catch {
      setInviteResult("Failed to send invites. Check your email and app password.");
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <main style={{ maxWidth: 940, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <Title level={1} style={{ color: "var(--text-primary)", margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.02em" }}>
            Veridicus
          </Title>
          <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>
            {session?.user?.email ?? "resume · authentication · system"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button icon={<MailOutlined />} onClick={openInviteModal}>
            Invite Candidates
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/upload")}>
            Upload Resume
          </Button>
          <Button icon={<LogoutOutlined />} onClick={() => signOut({ callbackUrl: "/" })} />
        </div>
      </div>

      {/* Org Stats */}
      {stats && (
        <GlassCard style={{ padding: 24, marginBottom: 24 }}>
          <Row gutter={24}>
            <Col span={6}>
              <Statistic title={<span style={{ color: "var(--text-muted)", fontSize: 12 }}>Total Candidates</span>} value={stats.total_candidates} valueStyle={{ color: "var(--text-primary)" }} />
            </Col>
            <Col span={6}>
              <Statistic
                title={<span style={{ color: "var(--text-muted)", fontSize: 12 }}>Avg Veridicus Score</span>}
                value={stats.avg_veridicus_score != null ? Math.round(stats.avg_veridicus_score) : "—"}
                suffix={stats.avg_veridicus_score != null ? "%" : ""}
                valueStyle={{ color: stats.avg_veridicus_score != null && stats.avg_veridicus_score >= 70 ? "#10b981" : "#f59e0b" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={<span style={{ color: "var(--text-muted)", fontSize: 12 }}>Flagged Profiles</span>}
                value={stats.flagged_count}
                prefix={stats.flagged_count > 0 ? <WarningOutlined style={{ color: "#ef4444" }} /> : undefined}
                valueStyle={{ color: stats.flagged_count > 0 ? "#ef4444" : "var(--text-primary)" }}
              />
            </Col>
            <Col span={6}>
              <Statistic title={<span style={{ color: "var(--text-muted)", fontSize: 12 }}>Pending Invites</span>} value={stats.pending_invites} valueStyle={{ color: "var(--text-primary)" }} />
            </Col>
          </Row>
        </GlassCard>
      )}

      {/* Skill Heatmap */}
      {candidates.length > 0 && <SkillHeatmap candidates={candidates} />}

      {/* Candidate list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Spin size="large" />
          <p style={{ color: "var(--text-muted)", marginTop: 20, fontSize: 14 }}>Loading candidates…</p>
        </div>
      ) : loadError ? (
        <GlassCard style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 16 }}>{loadError}</p>
          <Button type="primary" onClick={load}>Retry</Button>
        </GlassCard>
      ) : candidates.length === 0 ? (
        <GlassCard style={{ padding: 48 }}>
          <Empty description={<span style={{ color: "var(--text-muted)" }}>No assessments yet. Invite candidates or upload a resume.</span>} />
        </GlassCard>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {candidates.map((c) => (
            <GlassCard key={c.id} className="stagger-item" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <Title level={4} style={{ color: "var(--text-primary)", margin: 0 }}>{c.name}</Title>
                    <InviteStatusBadge email={c.email} invitations={invitations} />
                  </div>
                  <Text style={{ color: "var(--text-muted)" }}>{c.email}</Text>
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {c.claims.map((cl) => (
                      <Tag key={cl.id} color="blue">{cl.skill_name}</Tag>
                    ))}
                  </div>
                  <SkillMatrix skills={c.skill_confidences ?? []} />
                  {(() => {
                    const gh = githubMap[c.id];
                    if (!gh || gh.github_skipped || gh.matched_repos.length === 0) return null;
                    return (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <GithubOutlined style={{ color: "var(--text-muted)", fontSize: 12 }} />
                        {gh.matched_repos.map((repo) => (
                          <span key={repo.repo_name} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 999, padding: "2px 10px", fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>
                            {repo.repo_name}
                            {repo.language && <span style={{ fontFamily: "monospace", color: "#7c3aed", fontSize: 10 }}>{repo.language}</span>}
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
                      <div><Text style={{ color: "var(--text-muted)", fontSize: 12 }}>avg score</Text></div>
                    </>
                  ) : (
                    <Tag color="default">Pending</Tag>
                  )}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
                    {(c.tab_switch_count ?? 0) > 0 && (
                      <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>Tabs: {c.tab_switch_count}</Tag>
                    )}
                    <Tag color={(c.integrity_status ?? "pass") === "pass" ? "success" : "error"} style={{ fontSize: 11, margin: 0 }}>
                      {(c.integrity_status ?? "pass") === "pass" ? "✓ Pass" : "✗ Fail"}
                    </Tag>
                  </div>
                  <Button type="link" style={{ color: "#2563eb", padding: 0, marginTop: 8 }} onClick={() => router.push(`/assessment/${c.id}`)}>
                    View Assessment →
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        title={<span style={{ color: "var(--text-primary)" }}>Invite Candidates</span>}
        open={inviteOpen}
        width={680}
        onCancel={() => { setInviteOpen(false); setInviteResult(null); }}
        footer={[
          <Button key="cancel" onClick={() => { setInviteOpen(false); setInviteResult(null); }}>Cancel</Button>,
          <Button key="send" type="primary" loading={inviteSending} icon={<MailOutlined />} onClick={handleSendInvites}>
            Send Invites
          </Button>,
        ]}
      >
        <Tabs
          activeKey={inviteTab}
          onChange={setInviteTab}
          size="small"
          items={[
            {
              key: "compose",
              label: <span><EditOutlined /> Compose</span>,
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Your Email (sender)</label>
                    <Input
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="you@gmail.com"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      App Password{" "}
                      <span style={{ fontSize: 11 }}>
                        (Gmail:{" "}
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                          generate one here
                        </a>)
                      </span>
                    </label>
                    <Input.Password
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder="16-character app password"
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      Candidate Emails <span style={{ fontStyle: "italic" }}>(one per line or comma-separated)</span>
                    </label>
                    <TextArea
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      placeholder={"alice@example.com\nbob@example.com"}
                      rows={3}
                      style={{ fontFamily: "monospace" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Email Subject</label>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="You've been invited by {org_name} to verify your technical skills"
                    />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Use <code style={{ fontSize: 11 }}>{"{org_name}"}</code> and <code style={{ fontSize: 11 }}>{"{invite_url}"}</code> as placeholders.
                    </span>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      Email Body (HTML){" "}
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontSize: 11, height: "auto" }}
                        onClick={() => setInviteTab("preview")}
                      >
                        preview →
                      </Button>
                    </label>
                    <TextArea
                      value={emailHtml}
                      onChange={(e) => setEmailHtml(e.target.value)}
                      rows={10}
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                      placeholder="HTML email body. Use {org_name} and {invite_url} as placeholders."
                    />
                  </div>
                </div>
              ),
            },
            {
              key: "preview",
              label: <span><EyeOutlined /> Preview</span>,
              children: (
                <div style={{ paddingTop: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    Rendered with sample values. <code style={{ fontSize: 11 }}>{"{org_name}"}</code> → <em>Your Organization</em>,{" "}
                    <code style={{ fontSize: 11 }}>{"{invite_url}"}</code> → sample link.
                  </p>
                  {emailHtml ? (
                    <iframe
                      srcDoc={emailHtml
                        .replace(/\{org_name\}/g, session?.user?.name ?? "Your Organization")
                        .replace(/\{invite_url\}/g, "#sample-invite-link")}
                      sandbox="allow-same-origin"
                      style={{
                        width: "100%",
                        height: 420,
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        background: "#fff",
                      }}
                      title="Email preview"
                    />
                  ) : (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                      No template to preview yet. Switch to Compose to write one.
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
        {inviteResult && (
          <p style={{ marginTop: 12, color: inviteResult.startsWith("✓") ? "#10b981" : "#ef4444", fontWeight: 600 }}>
            {inviteResult}
          </p>
        )}
      </Modal>
    </main>
  );
}
