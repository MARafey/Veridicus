"use client";

import { useState } from "react";
import { Button, message } from "antd";
import { DeleteOutlined, WarningOutlined } from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";
import { flushDatabase } from "@/lib/api";

export default function DangerZonePage() {
  const [confirming, setConfirming] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [flushed, setFlushed] = useState(false);

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await flushDatabase();
      setFlushed(true);
      setConfirming(false);
      message.success("Database flushed. Everything has been wiped.");
    } catch {
      message.error("Flush failed. Check the backend logs.");
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div style={{ padding: "48px 40px", maxWidth: 560 }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: 6,
          }}
        >
          Danger Zone
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          Irreversible actions that affect the entire platform.
        </p>
      </div>

      <GlassCard
        variant="elevated"
        style={{
          padding: 32,
          border: "1px solid rgba(239,68,68,0.2)",
          background: "rgba(255,255,255,0.88)",
        }}
      >
        {/* Icon + title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(239,68,68,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <DeleteOutlined style={{ fontSize: 20, color: "#dc2626" }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Flush Entire Database
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              Wipes all candidates, assessments, claims, PDFs, and GitHub audit data.
            </div>
          </div>
        </div>

        {/* What gets deleted */}
        <div
          style={{
            background: "rgba(239,68,68,0.05)",
            border: "1px solid rgba(239,68,68,0.12)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", marginBottom: 8 }}>
            This will permanently delete:
          </div>
          {[
            "All candidates and their resume data",
            "All extracted skills and claims",
            "All scraped PDF source documents",
            "All generated assessment questions and answers",
            "All GitHub verification records",
            "All interrogation sessions and reports",
            "All downloaded PDF files on disk",
          ].map((item) => (
            <div
              key={item}
              style={{
                fontSize: 12,
                color: "var(--text-body)",
                paddingLeft: 12,
                marginBottom: 3,
              }}
            >
              · {item}
            </div>
          ))}
        </div>

        {/* Success state */}
        {flushed && (
          <div
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              color: "#15803d",
              fontWeight: 600,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            Database wiped successfully. The platform is now empty.
          </div>
        )}

        {/* Confirm step */}
        {!confirming ? (
          <Button
            danger
            size="large"
            block
            icon={<WarningOutlined />}
            onClick={() => setConfirming(true)}
            disabled={flushed}
            style={{ height: 48, fontWeight: 700, borderRadius: 10 }}
          >
            Flush Database
          </Button>
        ) : (
          <div>
            <div
              style={{
                fontSize: 13,
                color: "#dc2626",
                fontWeight: 600,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Are you absolutely sure? This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                block
                onClick={() => setConfirming(false)}
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                danger
                type="primary"
                block
                loading={flushing}
                icon={<DeleteOutlined />}
                onClick={handleFlush}
                style={{ borderRadius: 10, fontWeight: 700 }}
              >
                Yes, wipe everything
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      <p
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        ⓘ&nbsp; The backend will re-create empty tables automatically on next startup.
      </p>
    </div>
  );
}
