"use client";

import { Progress } from "antd";

interface Props {
  score: number;
  feedback?: string | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--error)";
}

export default function ScoreDisplay({ score, feedback }: Props) {
  const color = scoreColor(score);
  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <Progress
        type="circle"
        percent={Math.round(score)}
        strokeColor={color}
        trailColor="rgba(59,130,246,0.08)"
        strokeWidth={8}
        size={120}
        format={(pct) => (
          <span className="mono" style={{ color, fontSize: 26, fontWeight: 700 }}>{pct}%</span>
        )}
      />
      {feedback && (
        <div
          style={{
            marginTop: 20,
            textAlign: "left",
            background: "rgba(37,99,235,0.04)",
            border: "1px solid rgba(37,99,235,0.12)",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <p style={{ color: "var(--text-body)", lineHeight: 1.75, fontWeight: 400, margin: 0, fontSize: 14 }}>
            {feedback}
          </p>
        </div>
      )}
    </div>
  );
}
