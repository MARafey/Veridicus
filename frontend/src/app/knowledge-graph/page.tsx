"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  useReactFlow,
  Handle,
  Position,
  NodeTypes,
  Node,
  Edge,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GithubOutlined, FileTextOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { getCandidates, getGitHubVerification, getSources } from "@/lib/api";
import type { SourceDoc } from "@/lib/api";
import type { Candidate, GitHubVerification } from "@/lib/types";

// ─── Custom Node Data Types ───────────────────────────────────────────────────

type SkillData = { label: string };
type ProjectData = { label: string; language: string; isGithub: boolean };
type KnowledgeData = { label: string };
type LangSkillData = { label: string; matchType: "project_match" | "skill_match" };
type ResourceData = { label: string };

// ─── Custom Node Components ───────────────────────────────────────────────────

function SkillNode({ data }: NodeProps & { data: SkillData }) {
  return (
    <div
      style={{
        background: "rgba(59,130,246,0.12)",
        border: "1px solid rgba(59,130,246,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderRadius: "999px",
        padding: "6px 16px",
        cursor: "default",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <span className="mono" style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>
        {data.label}
      </span>
    </div>
  );
}

function ProjectNode({ data }: NodeProps & { data: ProjectData }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.80)",
        border: "1px solid rgba(255,255,255,0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: 16,
        padding: "14px 18px",
        width: 200,
        boxShadow: "0 4px 16px rgba(15,42,110,0.08)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {data.isGithub && (
          <GithubOutlined style={{ color: "#1d4ed8", fontSize: 14 }} />
        )}
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data.label}
        </span>
      </div>
      <span
        className="mono"
        style={{
          fontSize: 11,
          background: "rgba(37,99,235,0.08)",
          color: "#2563eb",
          padding: "2px 8px",
          borderRadius: 999,
        }}
      >
        {data.language}
      </span>
    </div>
  );
}

function KnowledgeNode({ data }: NodeProps & { data: KnowledgeData }) {
  return (
    <div
      style={{
        background: "rgba(219,234,254,0.55)",
        border: "1px solid rgba(37,99,235,0.2)",
        borderRadius: 12,
        padding: "12px 16px",
        width: 180,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <FileTextOutlined
        style={{ color: "#2563eb", fontSize: 16, marginBottom: 6, display: "block" }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {data.label}
      </span>
    </div>
  );
}

function LangSkillNode({ data }: NodeProps & { data: LangSkillData }) {
  const isSkill = data.matchType === "skill_match";
  return (
    <div
      style={{
        background: isSkill ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
        border: `1px solid ${isSkill ? "rgba(245,158,11,0.4)" : "rgba(16,185,129,0.4)"}`,
        borderRadius: 999,
        padding: "5px 14px",
        cursor: "default",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <span
        className="mono"
        style={{ fontSize: 11, fontWeight: 700, color: isSkill ? "#b45309" : "#059669" }}
      >
        {data.label}
      </span>
    </div>
  );
}

function ResourceNode({ data }: NodeProps & { data: ResourceData }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.06)",
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        width: 160,
        cursor: "default",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  skill: SkillNode as NodeTypes[string],
  project: ProjectNode as NodeTypes[string],
  knowledge: KnowledgeNode as NodeTypes[string],
  langskill: LangSkillNode as NodeTypes[string],
  resource: ResourceNode as NodeTypes[string],
};

// ─── Graph builder ────────────────────────────────────────────────────────────

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

function buildGraph(
  candidates: Candidate[],
  sourcesMap: Record<number, SourceDoc[]>,
  githubMap: Record<number, GitHubVerification | null>,
): GraphData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Layout: candidates stacked vertically, each with a ring of skills/docs
  const CANDIDATE_X = 350;
  const CANDIDATE_GAP = 500;

  candidates.forEach((candidate, ci) => {
    const cy = ci * CANDIDATE_GAP + 300;
    const candId = `c${candidate.id}`;

    // Candidate node
    nodes.push({
      id: candId,
      type: "project",
      position: { x: CANDIDATE_X, y: cy },
      data: { label: candidate.name, language: candidate.email, isGithub: false },
    });

    // Skill nodes — fan out left
    const skills = candidate.claims ?? [];
    skills.forEach((claim, si) => {
      const sx = CANDIDATE_X - 220;
      const sy = cy - ((skills.length - 1) * 60) / 2 + si * 60;
      const skillId = `skill-${claim.id}`;

      nodes.push({
        id: skillId,
        type: "skill",
        position: { x: sx, y: sy },
        data: { label: claim.skill_name },
      });

      edges.push({
        id: `e-${skillId}-${candId}`,
        source: skillId,
        target: candId,
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 1.5 },
      });

      // PDF knowledge nodes for this skill
      const docs = (sourcesMap[candidate.id] ?? []).filter(
        (d) => d.claim_id === claim.id,
      );
      docs.forEach((doc, di) => {
        const docId = `doc-${doc.id}`;
        nodes.push({
          id: docId,
          type: "knowledge",
          position: { x: sx - 240, y: sy - 40 + di * 110 },
          data: { label: doc.document_title || doc.document_url.split("/").pop() },
        });
        edges.push({
          id: `e-${docId}-${skillId}`,
          source: docId,
          target: skillId,
          style: { stroke: "#bfdbfe", strokeWidth: 1, strokeDasharray: "4 3" },
        });
      });
    });

    // GitHub repo nodes — 3-level hierarchy: Repo → LangSkill → Resource
    const gh = githubMap[candidate.id];
    if (gh && !gh.github_skipped && gh.matched_repos.length > 0) {
      gh.matched_repos.forEach((repo, ri) => {
        const repoId = `repo-${candidate.id}-${ri}`;
        const ry = cy - ((gh.matched_repos.length - 1) * 120) / 2 + ri * 120;

        // Level 1: Repo node
        nodes.push({
          id: repoId,
          type: "project",
          position: { x: CANDIDATE_X + 260, y: ry },
          data: { label: repo.repo_name, language: repo.language || repo.matched_claim, isGithub: true },
        });
        edges.push({
          id: `e-${repoId}-${candId}`,
          source: candId,
          target: repoId,
          style: { stroke: "#93c5fd", strokeWidth: 1 },
        });

        // Level 2: Language/Skill nodes
        const langs = repo.audit_languages ?? (repo.language ? [repo.language] : []);
        langs.slice(0, 4).forEach((lang, li) => {
          const langId = `lang-${candidate.id}-${ri}-${li}`;
          const ly = ry - ((langs.length - 1) * 55) / 2 + li * 55;
          nodes.push({
            id: langId,
            type: "langskill",
            position: { x: CANDIDATE_X + 500, y: ly },
            data: { label: lang, matchType: repo.match_type ?? "project_match" },
          });
          edges.push({
            id: `e-${langId}-${repoId}`,
            source: repoId,
            target: langId,
            style: { stroke: "#6ee7b7", strokeWidth: 1 },
          });

          // Level 3: Resource nodes (attach to first lang only to avoid clutter)
          if (li === 0) {
            const resources = repo.audit_resources ?? [];
            resources.slice(0, 4).forEach((res, resi) => {
              const resId = `res-${candidate.id}-${ri}-${resi}`;
              nodes.push({
                id: resId,
                type: "resource",
                position: {
                  x: CANDIDATE_X + 720,
                  y: ry - ((resources.length - 1) * 48) / 2 + resi * 48,
                },
                data: { label: res },
              });
              edges.push({
                id: `e-${resId}-${langId}`,
                source: langId,
                target: resId,
                style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "3 3" },
              });
            });
          }
        });
      });
    }
  });

  return { nodes, edges };
}

// ─── Filter ───────────────────────────────────────────────────────────────────

type FilterType = "all" | "skill" | "project" | "knowledge" | "langskill" | "resource";
const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  skill: "Resume Skills",
  project: "Repos",
  knowledge: "PDFs",
  langskill: "Lang/Skills",
  resource: "Resources",
};

// ─── Inner Graph Component ────────────────────────────────────────────────────

function KnowledgeGraphInner() {
  const router = useRouter();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [filter, setFilter] = useState<FilterType>("all");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourcesMap, setSourcesMap] = useState<Record<number, SourceDoc[]>>({});
  const [githubMap, setGithubMap] = useState<Record<number, GitHubVerification | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cands = await getCandidates();
        if (cancelled) return;
        setCandidates(cands);

        const [srcEntries, ghEntries] = await Promise.all([
          Promise.all(
            cands.map(async (c) => {
              const docs = await getSources(c.id).catch(() => []);
              return [c.id, docs] as [number, SourceDoc[]];
            }),
          ),
          Promise.all(
            cands.map(async (c) => {
              const gh = await getGitHubVerification(c.id).catch(() => null);
              return [c.id, gh] as [number, GitHubVerification | null];
            }),
          ),
        ]);

        if (cancelled) return;
        setSourcesMap(Object.fromEntries(srcEntries));
        setGithubMap(Object.fromEntries(ghEntries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { nodes: rawNodes, edges } = useMemo(
    () => buildGraph(candidates, sourcesMap, githubMap),
    [candidates, sourcesMap, githubMap],
  );

  const nodes = useMemo(
    () =>
      rawNodes.map((n) => ({
        ...n,
        hidden: filter !== "all" && n.type !== filter,
      })),
    [rawNodes, filter],
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 400 });
  }, [fitView]);

  return (
    <>
      {/* Back bar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.4)",
          boxShadow: "0 1px 12px rgba(15,42,110,0.06)",
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-body)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          ← Back to Dashboard
        </button>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.04em" }}>
          ◈ Knowledge Graph
        </span>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
            background: "rgba(240,247,255,0.7)",
          }}
        >
          <Spin size="large" />
        </div>
      )}

      {/* Empty state */}
      {!loading && candidates.length === 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            zIndex: 5,
          }}
        >
          <span style={{ fontSize: 40 }}>◈</span>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            No data yet
          </p>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Upload a resume to populate the knowledge graph.
          </p>
        </div>
      )}

      {/* React Flow canvas */}
      <div style={{ width: "100vw", height: "100vh" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          style={{ background: "transparent" }}
        >
          <Background color="#bfdbfe" gap={24} size={1} />

          <Panel position="bottom-center">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.55)",
                borderRadius: 999,
                padding: "8px 16px",
                boxShadow: "0 4px 20px rgba(15,42,110,0.10)",
                marginBottom: 16,
              }}
            >
              {[
                { label: "−", action: () => zoomOut({ duration: 200 }) },
                { label: "+", action: () => zoomIn({ duration: 200 }) },
                { label: "⊞ Fit", action: handleFitView },
              ].map(({ label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    background: "rgba(37,99,235,0.06)",
                    border: "1px solid rgba(37,99,235,0.15)",
                    borderRadius: 8,
                    padding: "4px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1d4ed8",
                  }}
                >
                  {label}
                </button>
              ))}

              <div style={{ width: 1, height: 20, background: "rgba(37,99,235,0.15)", margin: "0 4px" }} />

              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Filter:</span>
              {(["all", "skill", "project", "knowledge", "langskill", "resource"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    background: filter === f ? "rgba(37,99,235,0.12)" : "transparent",
                    border: filter === f ? "1px solid rgba(37,99,235,0.3)" : "1px solid transparent",
                    borderRadius: 8,
                    padding: "4px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: filter === f ? 700 : 500,
                    color: filter === f ? "#1d4ed8" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <style>{`
        .react-flow__edge-path:hover { filter: drop-shadow(0 0 4px #3b82f6); }
      `}</style>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner />
    </ReactFlowProvider>
  );
}
