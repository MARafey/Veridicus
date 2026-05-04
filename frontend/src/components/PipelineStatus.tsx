"use client";

import { useEffect, useRef, useState } from "react";
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
  scraping:   1,
  verifying:  2,
  generating: 3,
  ready:      4,
};

const STATUS_LABEL: Record<string, string> = {
  extracting: "Parsing your resume and extracting skills…",
  scraping:   "Searching for technical documentation and PDFs…",
  verifying:  "Auditing your GitHub repositories…",
  generating: "Generating personalised interview questions…",
  ready:      "All done! Launching your assessment…",
};

interface Props {
  candidateId: number;
  jobId: string;
  onReady?: () => void;
}

export default function PipelineStatus({ candidateId, jobId, onReady }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [statusLabel, setStatusLabel] = useState("Preparing your assessment…");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      if (cancelledRef.current) return;
      try {
        const status = await getPipelineStatus(candidateId, jobId);
        if (cancelledRef.current) return;

        if (status.status === "error") {
          setError(status.error || "Pipeline failed. Please try again.");
          return;
        }

        const idx = STATUS_INDEX[status.status] ?? 0;
        setCurrent(idx);
        setStatusLabel(STATUS_LABEL[status.status] || "Processing…");

        if (status.status === "ready") {
          timerRef.current = setTimeout(() => {
            if (!cancelledRef.current) {
              if (onReady) onReady();
              else router.push(`/assessment/${candidateId}`);
            }
          }, 1200);
          return;
        }
      } catch {
        // backend may not be ready yet — keep polling silently
      }

      if (!cancelledRef.current) {
        timerRef.current = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [candidateId, jobId, router, onReady]);

  if (error) {
    return (
      <Alert
        type="error"
        message="Pipeline Error"
        description={error}
        showIcon
        style={{ marginTop: 16 }}
      />
    );
  }

  return (
    <div style={{ padding: "24px 0" }}>
      {/* Animated spinner + dynamic label */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Spin size="large" />
        <p style={{ color: "var(--text-body)", marginTop: 16, fontWeight: 600, fontSize: 15 }}>
          {statusLabel}
        </p>
      </div>

      {/* Step tracker */}
      <Steps
        current={current}
        direction="vertical"
        size="small"
        items={STEPS.map((s, i) => ({
          title: s.title,
          description: s.description,
          status: i < current ? "finish" : i === current ? "process" : "wait",
        }))}
      />
    </div>
  );
}
