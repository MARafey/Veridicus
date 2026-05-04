"use client";

import { useState, useEffect, useCallback } from "react";
import { Table, Button, Tag, Input, Modal, message, Spin, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import { GithubOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";
import { getCandidates, getGitHubVerification, reVerifyGithub, getPipelineStatus } from "@/lib/api";
import type { Candidate, GitHubVerification } from "@/lib/types";

interface Row {
  key: number;
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  skipped: boolean;
  matched_repos: number;
  has_verification: boolean;
}

type JobState = { jobId: string; status: "running" | "done" | "error"; error?: string };

export default function GithubVerificationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Record<number, JobState>>({});

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCandidate, setModalCandidate] = useState<Row | null>(null);
  const [usernameInput, setUsernameInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const candidates: Candidate[] = await getCandidates();
      const withGh = await Promise.all(
        candidates.map(async (c) => {
          const gh: GitHubVerification | null = await getGitHubVerification(c.id);
          return {
            key: c.id,
            id: c.id,
            name: c.name,
            email: c.email,
            github_username: gh?.github_username ?? null,
            skipped: gh?.github_skipped ?? true,
            matched_repos: gh?.matched_repos?.length ?? 0,
            has_verification: !!gh,
          } satisfies Row;
        })
      );
      setRows(withGh);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll running jobs
  useEffect(() => {
    const running = Object.entries(jobs).filter(([, j]) => j.status === "running");
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const [candidateIdStr, job] of running) {
        const candidateId = Number(candidateIdStr);
        try {
          const s = await getPipelineStatus(candidateId, job.jobId);
          if (s.status === "ready") {
            setJobs((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], status: "done" } }));
            message.success("GitHub re-verification complete.");
            load();
          } else if (s.status === "error") {
            setJobs((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], status: "error", error: s.error ?? "Unknown error" } }));
            message.error(`Re-verification failed: ${s.error ?? "Unknown error"}`);
          }
        } catch {
          // job_store may not have it yet — keep polling
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobs, load]);

  const openModal = (row: Row) => {
    setModalCandidate(row);
    setUsernameInput(row.github_username ?? "");
    setModalOpen(true);
  };

  const handleReVerify = async () => {
    if (!modalCandidate) return;
    setModalOpen(false);
    const id = modalCandidate.id;
    try {
      const { job_id } = await reVerifyGithub(id, usernameInput.trim() || undefined);
      setJobs((prev) => ({ ...prev, [id]: { jobId: job_id, status: "running" } }));
      message.info("Re-verification started — polling for results...");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to start re-verification.";
      message.error(msg);
    }
  };

  const columns: ColumnsType<Row> = [
    {
      title: "Candidate",
      key: "candidate",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{r.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.email}</div>
        </div>
      ),
    },
    {
      title: "GitHub Username",
      key: "github",
      render: (_, r) => {
        if (!r.has_verification) return <span style={{ color: "var(--text-muted)", fontSize: 13 }}>No verification yet</span>;
        if (r.skipped || !r.github_username) return <Tag style={{ borderRadius: 999, border: "none", background: "rgba(100,116,139,0.08)", color: "var(--text-muted)" }}>Skipped</Tag>;
        return (
          <a href={`https://github.com/${r.github_username}`} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#2563eb", fontWeight: 600, fontSize: 13 }}>
            <GithubOutlined /> {r.github_username}
          </a>
        );
      },
    },
    {
      title: "Matched Repos",
      key: "repos",
      width: 140,
      render: (_, r) => {
        if (!r.has_verification || r.skipped) return <span style={{ color: "var(--text-muted)" }}>—</span>;
        return (
          <Tag style={{ borderRadius: 999, border: "none", background: "rgba(37,99,235,0.08)", color: "#1d4ed8", fontWeight: 600, fontSize: 12 }}>
            {r.matched_repos} repo{r.matched_repos !== 1 ? "s" : ""}
          </Tag>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      width: 140,
      render: (_, r) => {
        const job = jobs[r.id];
        if (job?.status === "running") return <Tag icon={<SyncOutlined spin />} style={{ borderRadius: 999, border: "none", background: "rgba(234,179,8,0.10)", color: "#854d0e", fontWeight: 600, fontSize: 12 }}>Running</Tag>;
        if (job?.status === "done") return <Tag style={{ borderRadius: 999, border: "none", background: "rgba(34,197,94,0.10)", color: "#15803d", fontWeight: 600, fontSize: 12 }}>Done</Tag>;
        if (job?.status === "error") return <Tag style={{ borderRadius: 999, border: "none", background: "rgba(239,68,68,0.10)", color: "#b91c1c", fontWeight: 600, fontSize: 12 }}>Error</Tag>;
        if (!r.has_verification) return <Tag style={{ borderRadius: 999, border: "none", background: "rgba(100,116,139,0.08)", color: "var(--text-muted)", fontSize: 12 }}>Never run</Tag>;
        return <Tag style={{ borderRadius: 999, border: "none", background: "rgba(37,99,235,0.08)", color: "#1d4ed8", fontSize: 12 }}>Verified</Tag>;
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, r) => {
        const job = jobs[r.id];
        const running = job?.status === "running";
        return (
          <Button
            size="small"
            icon={<GithubOutlined />}
            loading={running}
            onClick={() => openModal(r)}
            style={{ borderRadius: 8, fontWeight: 600, borderColor: "#2563eb", color: "#2563eb" }}
          >
            Re-verify
          </Button>
        );
      },
    },
  ];

  return (
    <div style={{ padding: "48px 40px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0, marginBottom: 6 }}>
            GitHub Re-verification
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Re-run the GitHub audit for any candidate. Optionally override the stored username.
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>
          Refresh
        </Button>
      </div>

      <GlassCard variant="elevated" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}><Spin size="default" /></div>
        ) : rows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ color: "var(--text-muted)", fontSize: 13 }}>No candidates found</span>}
            style={{ padding: "64px 0" }} />
        ) : (
          <Table dataSource={rows} columns={columns} pagination={false} rowKey="id" style={{ background: "transparent" }} />
        )}
      </GlassCard>

      <Modal
        title="Re-verify GitHub"
        open={modalOpen}
        onOk={handleReVerify}
        onCancel={() => setModalOpen(false)}
        okText="Start Re-verification"
        okButtonProps={{ style: { borderRadius: 8, fontWeight: 600 } }}
        cancelButtonProps={{ style: { borderRadius: 8 } }}
      >
        <p style={{ marginBottom: 12, color: "var(--text-muted)", fontSize: 13 }}>
          Candidate: <strong>{modalCandidate?.name}</strong>
        </p>
        <p style={{ marginBottom: 8, fontSize: 13 }}>
          GitHub username (leave blank to use stored value):
        </p>
        <Input
          prefix={<GithubOutlined />}
          placeholder={modalCandidate?.github_username ?? "github-username"}
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          style={{ borderRadius: 8 }}
        />
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
          This will delete the existing GitHub verification and all GitHub-sourced questions for this candidate, then re-run the audit.
        </p>
      </Modal>
    </div>
  );
}
