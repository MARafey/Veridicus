"use client";

import { useState } from "react";
import { Button, Form, Input, Upload, message } from "antd";
import { InboxOutlined, GithubOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { uploadResume } from "@/lib/api";
import type { UploadResponse } from "@/lib/types";

const { Dragger } = Upload;

interface Props {
  onUploaded: (resp: UploadResponse) => void;
}

export default function ResumeUploader({ onUploaded }: Props) {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { name: string; email: string; github_username?: string }) => {
    if (fileList.length === 0) {
      message.error("Please attach a resume file.");
      return;
    }
    const file = fileList[0].originFileObj as File;
    setLoading(true);
    try {
      const resp = await uploadResume(values.name, values.email, file, values.github_username);
      onUploaded(resp);
    } catch {
      message.error("Upload failed. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ width: "100%" }}>
      <Form.Item
        name="name"
        label="Full Name"
        className="stagger-item"
        rules={[{ required: true, message: "Name required" }]}
      >
        <Input placeholder="Jane Doe" size="large" />
      </Form.Item>

      <Form.Item
        name="email"
        label="Email"
        className="stagger-item"
        rules={[{ required: true, type: "email", message: "Valid email required" }]}
      >
        <Input placeholder="jane@example.com" size="large" />
      </Form.Item>

      <Form.Item
        name="github_username"
        label="GitHub Username (optional)"
        className="stagger-item"
        extra="If your GitHub isn't in your resume, add it here so we can verify your code."
      >
        <Input
          prefix={<GithubOutlined style={{ color: "var(--text-muted)" }} />}
          placeholder="your-github-handle"
          size="large"
        />
      </Form.Item>

      <Form.Item label="Resume (PDF or TXT)" className="stagger-item">
        <Dragger
          accept=".pdf,.txt"
          beforeUpload={() => false}
          fileList={fileList}
          onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: "#2563eb", fontSize: 40 }} />
          </p>
          <p style={{ color: "var(--text-body)", fontWeight: 600 }}>Click or drag resume here</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>PDF or plain text</p>
        </Dragger>
      </Form.Item>

      <Form.Item className="stagger-item">
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          size="large"
          block
          style={{ height: 52, fontSize: 16, fontWeight: 700 }}
        >
          Begin Assessment →
        </Button>
      </Form.Item>
    </Form>
  );
}
