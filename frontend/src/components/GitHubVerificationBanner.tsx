"use client";

import { Alert, Tag, Typography, Space } from "antd";
import { GithubOutlined, LinkOutlined } from "@ant-design/icons";
import type { GitHubVerification } from "@/lib/types";

const { Text } = Typography;

interface Props {
  verification: GitHubVerification;
}

export default function GitHubVerificationBanner({ verification }: Props) {
  if (verification.github_skipped) {
    return (
      <Alert
        type="info"
        showIcon
        message="No GitHub profile found — documentation-only assessment"
        style={{ marginBottom: 24 }}
      />
    );
  }

  return (
    <div
      style={{
        background: "rgba(219,234,254,0.5)",
        border: "1px solid rgba(37,99,235,0.2)",
        borderRadius: 16,
        padding: "16px 20px",
        marginBottom: 24,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <Space align="center" style={{ marginBottom: 12 }}>
        <GithubOutlined style={{ color: "#2563eb", fontSize: 18 }} />
        <Text style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 15 }}>
          GitHub Verified — @{verification.github_username}
        </Text>
      </Space>

      {verification.matched_repos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span
            className="mono"
            style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}
          >
            Matched Repositories
          </span>
          <Space wrap>
            {verification.matched_repos.map((repo) => (
              <a
                key={repo.repo_name}
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Tag
                  icon={<LinkOutlined />}
                  color="blue"
                  style={{ cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                >
                  {repo.repo_name}
                  {repo.matched_claim && (
                    <span style={{ opacity: 0.7 }}> · {repo.matched_claim}</span>
                  )}
                </Tag>
              </a>
            ))}
          </Space>
        </div>
      )}

      {verification.verification_summary && (
        <div>
          <span
            className="mono"
            style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}
          >
            Verification Summary
          </span>
          <Text style={{ color: "var(--text-body)", fontSize: 13, fontWeight: 300, whiteSpace: "pre-wrap" }}>
            {verification.verification_summary.slice(0, 400)}
            {verification.verification_summary.length > 400 ? "…" : ""}
          </Text>
        </div>
      )}
    </div>
  );
}
