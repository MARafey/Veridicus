"use client";

import { Typography, Button } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import GlassCard from "@/components/GlassCard";

const { Title } = Typography;

function TerminatedContent({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px" }}>
      <GlassCard variant="elevated" style={{ padding: "48px 40px", textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "rgba(220,38,38,0.08)",
            border: "2px solid rgba(220,38,38,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: 30,
          }}
        >
          🚫
        </div>

        <Title level={2} style={{ color: "#dc2626", fontWeight: 900, marginBottom: 12 }}>
          Session Terminated
        </Title>

        {reason === "integrity" ? (
          <>
            <p style={{ color: "var(--text-body)", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              This session was terminated due to repeated tab-switching.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7, marginBottom: 36 }}>
              Your results are being compiled based on completed sections.
              The recruiter has been notified of the integrity violation.
            </p>
          </>
        ) : (
          <p style={{ color: "var(--text-body)", fontSize: 15, marginBottom: 36 }}>
            This assessment session has been terminated.
          </p>
        )}

        <Button
          type="primary"
          size="large"
          style={{ fontWeight: 700, height: 50, paddingInline: 36 }}
          onClick={() => router.push("/")}
        >
          Return to Dashboard
        </Button>
      </GlassCard>
    </main>
  );
}

interface Props {
  params: { id: string };
}

export default function TerminatedPage({ params }: Props) {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      </main>
    }>
      <TerminatedContent candidateId={params.id} />
    </Suspense>
  );
}
