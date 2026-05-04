"use client";

import { Button, Typography } from "antd";
import { signIn } from "next-auth/react";
import GlassCard from "@/components/GlassCard";

const { Title, Text } = Typography;

const FEATURES = [
  {
    icon: "◈",
    title: "Parse",
    desc: "AI extracts every claimed skill, project, and technology from the resume and cross-references them with official documentation.",
  },
  {
    icon: "⌬",
    title: "Interrogate",
    desc: "An adaptive LLM engine generates targeted questions in real time — breadth first, then deep-diving into weak spots.",
  },
  {
    icon: "◉",
    title: "Score",
    desc: "Each skill receives a live confidence score. Integrity metadata tracks behavioural signals throughout the session.",
  },
];

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: 640, marginBottom: 64 }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "var(--text-muted)",
            display: "block",
            marginBottom: 16,
          }}
        >
          Multi-Agent Resume Verification
        </span>
        <Title
          style={{
            color: "var(--text-primary)",
            fontSize: "clamp(40px, 6vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Authentication
          <br />
          <span style={{ color: "var(--blue-500, #3b82f6)" }}>through</span>
          <br />
          Interrogation
        </Title>
        <Text
          style={{
            color: "var(--text-body)",
            fontSize: 18,
            display: "block",
            marginTop: 24,
            marginBottom: 40,
            lineHeight: 1.6,
          }}
        >
          Veridicus verifies technical claims by scraping documentation, auditing GitHub code, and conducting a live adaptive interrogation — scoring candidates in real time.
        </Text>
        <Button
          type="primary"
          size="large"
          style={{ height: 52, paddingInline: 36, fontSize: 16, fontWeight: 700 }}
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Sign in with Google →
        </Button>
      </div>

      {/* Feature cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          maxWidth: 760,
          width: "100%",
        }}
      >
        {FEATURES.map((f) => (
          <GlassCard key={f.title} style={{ padding: 28 }}>
            <span
              style={{
                fontSize: 28,
                display: "block",
                marginBottom: 14,
                color: "var(--blue-400, #60a5fa)",
              }}
            >
              {f.icon}
            </span>
            <Title
              level={4}
              style={{ color: "var(--text-primary)", margin: "0 0 8px", fontWeight: 700 }}
            >
              {f.title}
            </Title>
            <Text style={{ color: "var(--text-body)", fontSize: 14, lineHeight: 1.6 }}>
              {f.desc}
            </Text>
          </GlassCard>
        ))}
      </div>

      <p
        className="mono"
        style={{
          marginTop: 64,
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Powered by LangGraph · Claude · Playwright
      </p>
    </main>
  );
}
