"use client";

import { useState } from "react";
import { Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import ResumeUploader from "@/components/ResumeUploader";
import PipelineStatus from "@/components/PipelineStatus";
import GlassCard from "@/components/GlassCard";
import type { UploadResponse } from "@/lib/types";

const { Title, Text } = Typography;

export default function UploadPage() {
  const router = useRouter();
  const [uploaded, setUploaded] = useState<UploadResponse | null>(null);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
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
        <ArrowLeftOutlined /> Back to Dashboard
      </button>

      <GlassCard variant="elevated" style={{ padding: 40 }}>
        {!uploaded ? (
          <>
            <Title
              level={2}
              style={{ color: "var(--text-primary)", textAlign: "center", marginBottom: 8, fontWeight: 900, fontSize: 32 }}
            >
              Upload Resume
            </Title>
            <Text style={{ color: "var(--text-muted)", display: "block", textAlign: "center", marginBottom: 32 }}>
              We&apos;ll research your skills and generate a targeted assessment
            </Text>
            <ResumeUploader onUploaded={setUploaded} />
          </>
        ) : (
          <>
            <Title level={3} style={{ color: "var(--text-primary)", textAlign: "center" }}>
              Pipeline Running
            </Title>
            <PipelineStatus candidateId={uploaded.candidate_id} jobId={uploaded.job_id} />
          </>
        )}
      </GlassCard>
    </main>
  );
}
