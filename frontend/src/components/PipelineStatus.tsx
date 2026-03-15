"use client";

import { useEffect, useState } from "react";
import { Steps, Alert, Spin } from "antd";
import { useRouter } from "next/navigation";
import { getPipelineStatus } from "@/lib/api";

const STEPS = [
  { title: "Extracting", description: "Parsing resume skills" },
  { title: "Scraping",   description: "Downloading PDFs" },
  { title: "Verifying",  description: "Auditing GitHub repos" },
  { title: "Generating", description: "Creating questions" },
  { title: "Ready",      description: "Assessment ready" },
];

const STATUS_INDEX: Record<string, number> = {
  extracting: 0,
  scraping: 1,
  verifying: 2,
  generating: 3,
  ready: 4,
};

interface Props {
  candidateId: number;
  jobId: string;
}

export default function PipelineStatus({ candidateId, jobId }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const status = await getPipelineStatus(candidateId, jobId);
        if (status.status === "error") {
          setError(status.error || "Pipeline failed");
          return;
        }
        const idx = STATUS_INDEX[status.status] ?? 0;
        setCurrent(idx);
        if (status.status === "ready") {
          setTimeout(() => router.push(`/assessment/${candidateId}`), 1000);
          return;
        }
      } catch {
        // backend may not be ready yet; keep polling
      }
      setTimeout(poll, 2000);
    };
    poll();
  }, [candidateId, jobId, router]);

  if (error) {
    return <Alert type="error" message="Pipeline Error" description={error} showIcon />;
  }

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <Spin size="large" />
        <p style={{ color: "var(--text-body)", marginTop: 16, fontWeight: 600 }}>
          Processing your resume...
        </p>
      </div>
      <Steps
        current={current}
        direction="vertical"
        items={STEPS.map((s) => ({ title: s.title, description: s.description }))}
      />
    </div>
  );
}
