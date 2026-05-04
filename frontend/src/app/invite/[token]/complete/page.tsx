"use client";

import { useSearchParams } from "next/navigation";
import { Typography, Button } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";

const { Title, Text } = Typography;

export default function InviteCompletePage() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const confirmCode = sessionId ? sessionId.slice(-8).toUpperCase() : "—";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <GlassCard style={{ maxWidth: 480, width: "100%", padding: 48, textAlign: "center" }}>
        <CheckCircleOutlined style={{ fontSize: 56, color: "#10b981", marginBottom: 24 }} />

        <Title level={2} style={{ color: "var(--text-primary)", marginBottom: 8 }}>
          Assessment Complete
        </Title>
        <Text
          style={{
            color: "var(--text-body)",
            fontSize: 16,
            display: "block",
            lineHeight: 1.6,
            marginBottom: 32,
          }}
        >
          Thank you for completing your Veridicus assessment. Your results have been submitted to the organization.
        </Text>

        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "16px 24px",
            marginBottom: 32,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--text-muted)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Confirmation Code
          </span>
          <span
            className="mono"
            style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.1em" }}
          >
            {confirmCode}
          </span>
        </div>

        <Text style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Keep this code for your records. You may close this window.
        </Text>
      </GlassCard>
    </main>
  );
}
