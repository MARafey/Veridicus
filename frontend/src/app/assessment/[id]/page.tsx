"use client";

import { Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import QuestionWizard from "@/components/QuestionWizard";

const { Title } = Typography;

interface Props {
  params: { id: string };
}

export default function AssessmentPage({ params }: Props) {
  const router = useRouter();
  const candidateId = parseInt(params.id, 10);

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px" }}>
      <button
        onClick={() => router.push("/")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        <ArrowLeftOutlined /> Dashboard
      </button>

      <div style={{ marginBottom: 32 }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--blue-500)",
            textTransform: "uppercase",
            fontWeight: 700,
            display: "block",
            marginBottom: 4,
          }}
        >
          ◈ Active Session
        </span>
        <Title
          level={2}
          style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: 32, letterSpacing: "-0.01em", margin: 0 }}
        >
          Interrogation Room
        </Title>
      </div>

      <QuestionWizard candidateId={candidateId} />
    </main>
  );
}
