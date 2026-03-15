"use client";

import { useState } from "react";
import { Form, Select, Button, message } from "antd";
import Upload, { RcFile } from "antd/es/upload";
import { CloudUploadOutlined } from "@ant-design/icons";
import GlassCard from "@/components/GlassCard";

const { Dragger } = Upload;

const JOB_ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "Data Scientist",
  "ML Engineer",
  "DevOps / Platform Engineer",
  "Financial Analyst",
  "Product Manager",
  "QA Engineer",
  "Custom Job Requirement...",
];

const TAG_SUGGESTIONS = [
  "React",
  "TypeScript",
  "Python",
  "FastAPI",
  "PostgreSQL",
  "Docker",
  "AWS",
  "Internal Framework X",
  "Company Rubric 2024",
  "Security Guidelines",
  "API Spec v3",
];

export default function UploadKnowledgePage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<RcFile[]>([]);

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      message.success("Knowledge base injected successfully!");
      form.resetFields();
      setFileList([]);
    }, 2000);
  };

  return (
    <div style={{ maxWidth: 600, padding: "48px 40px" }}>
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
          Upload Knowledge
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          Inject proprietary PDFs as ground-truth knowledge for a specific job role.
        </p>
      </div>

      <GlassCard variant="elevated" style={{ padding: 36 }}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="jobRole"
            label="Job Role / Domain"
            rules={[{ required: true, message: "Please select a job role" }]}
          >
            <Select
              showSearch
              placeholder="e.g. Frontend Engineer"
              optionFilterProp="label"
              options={JOB_ROLES.map((r) => ({ value: r, label: r }))}
              style={{ borderRadius: 12 }}
            />
          </Form.Item>

          <Form.Item
            name="tags"
            label="Knowledge Base Tags"
            rules={[{ required: true, message: "Add at least one tag" }]}
          >
            <Select
              mode="tags"
              placeholder="Add tags (e.g. React, Company Rubric 2024)"
              options={TAG_SUGGESTIONS.map((t) => ({ value: t, label: t }))}
              style={{ borderRadius: 12 }}
            />
          </Form.Item>

          <Form.Item
            name="files"
            label="PDF Documents"
            rules={[
              {
                validator: () =>
                  fileList.length > 0
                    ? Promise.resolve()
                    : Promise.reject("Upload at least one PDF"),
              },
            ]}
          >
            <Dragger
              accept=".pdf"
              multiple
              fileList={fileList}
              beforeUpload={(file) => {
                setFileList((prev) => [...prev, file]);
                return false;
              }}
              onRemove={(file) => {
                setFileList((prev) =>
                  prev.filter((f) => f.uid !== (file as RcFile).uid)
                );
              }}
              style={{
                background: "rgba(239,246,255,0.6)",
                border: "1.5px dashed rgba(59,130,246,0.3)",
                borderRadius: 16,
              }}
            >
              <div style={{ padding: "24px 16px" }}>
                <CloudUploadOutlined
                  style={{
                    fontSize: 40,
                    color: "#2563eb",
                    marginBottom: 12,
                    display: "block",
                  }}
                />
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-body)",
                    margin: 0,
                    marginBottom: 4,
                  }}
                >
                  Drop proprietary PDFs here
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  or click to browse — PDF, max 50 MB each
                </p>
              </div>
            </Dragger>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
              style={{ height: 52, fontWeight: 700, borderRadius: 12 }}
            >
              Inject Knowledge Base
            </Button>
          </Form.Item>
        </Form>
      </GlassCard>
    </div>
  );
}
