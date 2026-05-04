"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Typography, Button, Form, Input, Upload, Spin, Alert } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { getPublicInvite, startInvite } from "@/lib/api";
import type { PublicInvite } from "@/lib/types";
import GlassCard from "@/components/GlassCard";
import PipelineStatus from "@/components/PipelineStatus";

const { Title, Text } = Typography;

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobState, setJobState] = useState<{ candidateId: number; jobId: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    getPublicInvite(token)
      .then(setInvite)
      .catch(() => setError("Could not load invite. The link may be invalid."))
      .finally(() => setLoading(false));
  }, [token]);

  const onFinish = async (values: { name: string; github_username?: string }) => {
    if (!file) { setError("Please upload your resume (PDF)."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await startInvite(token, values.name, file, values.github_username);
      setJobState({ candidateId: res.candidate_id, jobId: res.job_id });
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to start assessment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!invite || !invite.valid) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <GlassCard style={{ maxWidth: 480, padding: 48, textAlign: "center" }}>
          <Title level={3} style={{ color: "var(--text-primary)" }}>
            {invite?.expired ? "Link Expired" : "Invalid Invite"}
          </Title>
          <Text style={{ color: "var(--text-body)" }}>
            {invite?.expired
              ? "This invite link has expired. Please contact the organization for a new one."
              : "This invite link is invalid or has already been used."}
          </Text>
        </GlassCard>
      </main>
    );
  }

  if (jobState) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "64px 24px" }}>
        <GlassCard style={{ padding: 32 }}>
          <Title level={3} style={{ color: "var(--text-primary)", marginBottom: 8 }}>
            Preparing Your Assessment
          </Title>
          <Text style={{ color: "var(--text-body)", display: "block", marginBottom: 24 }}>
            We're scraping documentation and auditing your code. This takes about 60–90 seconds.
          </Text>
          <PipelineStatus
            candidateId={jobState.candidateId}
            jobId={jobState.jobId}
            onReady={() => router.push(`/assessment/${jobState.candidateId}`)}
          />
        </GlassCard>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <GlassCard style={{ maxWidth: 520, width: "100%", padding: 48 }}>
        <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)", display: "block", marginBottom: 12 }}>
          Technical Assessment
        </span>
        <Title level={2} style={{ color: "var(--text-primary)", margin: "0 0 8px" }}>
          ◈ Veridicus
        </Title>
        <Text style={{ color: "var(--text-body)", display: "block", marginBottom: 32 }}>
          <strong style={{ color: "var(--text-primary)" }}>{invite.org_name}</strong> has invited you to verify your technical skills via an adaptive AI interrogation.
        </Text>

        <Form layout="vertical" onFinish={onFinish} initialValues={{ name: "" }}>
          <Form.Item
            label={<span style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Name</span>}
            name="name"
            rules={[{ required: true, message: "Please enter your name" }]}
          >
            <Input size="large" placeholder="Full name" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resume (PDF)</span>}
          >
            <Upload
              accept=".pdf"
              maxCount={1}
              beforeUpload={(f) => { setFile(f); return false; }}
              onRemove={() => setFile(null)}
            >
              <Button icon={<UploadOutlined />} size="large" style={{ width: "100%" }}>
                Upload Resume PDF
              </Button>
            </Upload>
          </Form.Item>

          <Form.Item
            label={<span style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>GitHub Username <span style={{ color: "var(--text-muted)" }}>(optional)</span></span>}
            name="github_username"
          >
            <Input size="large" placeholder="your-github-handle" prefix="@" />
          </Form.Item>

          {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" loading={submitting} style={{ width: "100%", height: 52, fontSize: 15, fontWeight: 700 }}>
              Begin Assessment →
            </Button>
          </Form.Item>
        </Form>

        <Text style={{ color: "var(--text-muted)", fontSize: 12, display: "block", marginTop: 20, textAlign: "center" }}>
          The assessment takes 15–25 minutes. Keep this tab open throughout.
        </Text>
      </GlassCard>
    </main>
  );
}
