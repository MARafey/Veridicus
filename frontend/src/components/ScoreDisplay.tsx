"use client";

import { Progress } from "antd";

interface Props {
  score: number;
  feedback?: string | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
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
        <div style={{ marginTop: 16, textAlign: "left" }}>
          <p style={{ color: "var(--text-body)", lineHeight: 1.7, fontWeight: 300, margin: 0 }}>{feedback}</p>
        </div>
      )}
    </div>
  );
}
