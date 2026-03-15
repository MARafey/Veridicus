"use client";

import { useState, useEffect, useCallback } from "react";
import { Table, Button, Popconfirm, Tag, message, Spin, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";
import { getCandidates, getAssessments, deleteAllAssessments } from "@/lib/api";
import type { Candidate } from "@/lib/types";

interface CandidateRow {
  key: number;
  id: number;
  name: string;
  email: string;
  assessmentCount: number;
  averageScore: number | null;
}

export default function ManageAssessmentsPage() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const candidates: Candidate[] = await getCandidates();
      const withCounts = await Promise.all(
        candidates.map(async (c) => {
          const assessments = await getAssessments(c.id);
          return {
            key: c.id,
            id: c.id,
            name: c.name,
            email: c.email,
            assessmentCount: assessments.length,
            averageScore: c.average_score,
          };
        })
      );
      setRows(withCounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteAll = async (candidateId: number, name: string) => {
    setDeleting(candidateId);
    try {
      await deleteAllAssessments(candidateId);
      message.success(`All assessments for ${name} deleted.`);
      setRows((prev) =>
        prev.map((r) =>
          r.id === candidateId ? { ...r, assessmentCount: 0, averageScore: null } : r
        )
      );
    } catch {
      message.error("Failed to delete assessments.");
    } finally {
      setDeleting(null);
    }
  };

  const columns: ColumnsType<CandidateRow> = [
    {
      title: "Candidate",
      key: "candidate",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>
            {r.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.email}</div>
        </div>
      ),
    },
    {
      title: "Assessments",
      key: "count",
      width: 130,
      render: (_, r) => (
        <Tag
          style={{
            background:
              r.assessmentCount === 0
                ? "rgba(100,116,139,0.08)"
                : "rgba(37,99,235,0.08)",
            border: "none",
            color: r.assessmentCount === 0 ? "var(--text-muted)" : "#1d4ed8",
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {r.assessmentCount} question{r.assessmentCount !== 1 ? "s" : ""}
        </Tag>
      ),
    },
    {
      title: "Avg Score",
      key: "score",
      width: 110,
      render: (_, r) => {
        if (r.averageScore === null || r.averageScore === undefined) {
          return <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>;
        }
        const score = Math.round(r.averageScore);
        const color =
          score >= 70 ? "#15803d" : score >= 40 ? "#854d0e" : "#b91c1c";
        const bg =
          score >= 70
            ? "rgba(34,197,94,0.10)"
            : score >= 40
            ? "rgba(234,179,8,0.10)"
            : "rgba(239,68,68,0.10)";
        return (
          <Tag
            style={{
              background: bg,
              border: "none",
              color,
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {score}%
          </Tag>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, r) => (
        <Popconfirm
          title={`Delete all assessments for ${r.name}?`}
          description="This permanently removes every question and answer for this candidate."
          okText="Delete All"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
          onConfirm={() => handleDeleteAll(r.id, r.name)}
          disabled={r.assessmentCount === 0}
        >
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleting === r.id}
            disabled={r.assessmentCount === 0}
            style={{ borderRadius: 8, fontWeight: 600 }}
          >
            Delete All
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: "48px 40px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              marginBottom: 6,
            }}
          >
            Manage Assessments
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Delete all saved questions and answers for any candidate.
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={load}
          loading={loading}
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          Refresh
        </Button>
      </div>

      <GlassCard variant="elevated" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <Spin size="default" />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No candidates found
              </span>
            }
            style={{ padding: "64px 0" }}
          />
        ) : (
          <Table
            dataSource={rows}
            columns={columns}
            pagination={false}
            rowKey="id"
            style={{ background: "transparent" }}
          />
        )}
      </GlassCard>

      <p
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 16,
          textAlign: "center",
        }}
      >
        ⓘ&nbsp; Deleting assessments is irreversible. The candidate record itself is preserved.
      </p>
    </div>
  );
}
