"use client";

import { useEffect, useState, useRef } from "react";
import { Button, Input, Radio, Typography, Spin, Alert, Space } from "antd";
import { GithubOutlined, FileTextOutlined } from "@ant-design/icons";
import { getNextQuestion, getReport, getSessionInfo, submitAnswer } from "@/lib/api";
import type { NextQuestion, SessionStatus } from "@/lib/types";
import ScoreDisplay from "./ScoreDisplay";
import GlassCard from "./GlassCard";

const { Title, Text } = Typography;
const { TextArea } = Input;
const TIMER_SECONDS = 120;

interface Props {
  candidateId: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SourceBadge({ source }: { source: "pdf" | "github" }) {
  if (source === "github") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(37,99,235,0.08)",
          border: "1px solid rgba(37,99,235,0.2)",
          color: "#2563eb",
          borderRadius: 999,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <GithubOutlined /> Code Verified
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(59,130,246,0.07)",
        border: "1px solid rgba(59,130,246,0.18)",
        color: "var(--blue-700)",
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      <FileTextOutlined /> Documentation
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const isBreadth = stage === "breadth";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: isBreadth ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
      border: isBreadth ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
      color: isBreadth ? "#059669" : "#dc2626",
      borderRadius: 999, padding: "3px 10px",
      fontSize: 11, fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
    }}>
      {isBreadth ? "Phase 1 · Breadth Scan" : "Phase 2 · Deep Dive"}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    MCQ: { bg: "rgba(124,58,237,0.08)", color: "#7c3aed", border: "rgba(124,58,237,0.2)" },
    TROUBLESHOOT: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.2)" },
    FILL_BLANK: { bg: "rgba(16,185,129,0.08)", color: "#059669", border: "rgba(16,185,129,0.2)" },
    WHAT_IF: { bg: "rgba(245,158,11,0.08)", color: "#d97706", border: "rgba(245,158,11,0.2)" },
    OPEN: { bg: "rgba(107,114,128,0.08)", color: "#6b7280", border: "rgba(107,114,128,0.2)" },
  };
  const style = colors[type] || colors.OPEN;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {type.replace("_", " ")}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#3b82f6";
  return (
    <div style={{ marginBottom: 16 }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
        Confidence {score.toFixed(0)}%
      </span>
      <div style={{ height: 2, borderRadius: 999, background: "rgba(255,255,255,0.08)", marginTop: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: color,
            transition: "width 0.5s ease, background 0.3s",
          }}
        />
      </div>
    </div>
  );
}

function TerminalScreen({
  sessionStatus,
  confidenceScore,
  questionNumber,
  report,
}: {
  sessionStatus: SessionStatus;
  confidenceScore: number;
  questionNumber: number;
  report: string | null;
}) {
  const labels: Record<string, string> = {
    terminated_success: "High Confidence Achieved",
    terminated_fail: "Insufficient Proficiency",
    terminated_limit: "Session Limit Reached",
  };
  const label = labels[sessionStatus] || "Session Ended";

  return (
    <GlassCard variant="elevated" style={{ padding: 40 }}>
      <span
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          display: "block",
          marginBottom: 8,
        }}
      >
        Assessment Complete
      </span>
      <Title level={2} style={{ color: "var(--text-primary)", fontWeight: 900, marginTop: 0, marginBottom: 24 }}>
        {label}
      </Title>
      <div style={{ display: "flex", gap: 32, marginBottom: 24 }}>
        <div>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            FINAL CONFIDENCE
          </span>
          <span className="mono" style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)" }}>
            {confidenceScore.toFixed(0)}%
          </span>
        </div>
        <div>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            QUESTIONS ASKED
          </span>
          <span className="mono" style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)" }}>
            {String(questionNumber).padStart(2, "0")}
          </span>
        </div>
      </div>
      {report ? (
        <div
          style={{
            maxHeight: 480,
            overflowY: "auto",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 13, color: "var(--text-secondary)", fontFamily: "inherit", lineHeight: 1.6 }}>
            {report}
          </pre>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <Spin size="small" /> <Text style={{ color: "var(--text-muted)", marginLeft: 8 }}>Generating report...</Text>
        </div>
      )}
      <Button
        type="primary"
        size="large"
        style={{ height: 52, fontWeight: 700 }}
        onClick={() => (window.location.href = "/")}
      >
        Back to Dashboard
      </Button>
    </GlassCard>
  );
}

export default function QuestionWizard({ candidateId }: Props) {
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestion | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("active");
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; feedback: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchReport = async () => {
    try {
      const { report: r } = await getReport(candidateId);
      setReport(r);
    } catch {
      // Report may still be generating — leave null, user sees spinner
    }
  };

  const fetchNextQuestion = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = await getNextQuestion(candidateId);
      if (q.assessment_status === "CONTINUE") {
        setCurrentQuestion(q);
        setConfidenceScore(q.current_confidence_score);
        setQuestionNumber(q.question_number);
        setAnswer("");
        setSelectedOption(null);
        setResult(null);
        setTimeLeft(TIMER_SECONDS);
      } else {
        // Terminated
        setSessionStatus(q.session_status);
        setConfidenceScore(q.current_confidence_score);
        setQuestionNumber(q.question_number);
        await fetchReport();
      }
    } catch (err: unknown) {
      // 409 = already terminated
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { status?: number; data?: { detail?: { session_status?: SessionStatus; final_report?: string | null; current_confidence?: number; question_count?: number } } } };
        if (axiosErr.response?.status === 409) {
          const detail = axiosErr.response.data?.detail;
          if (detail) {
            setSessionStatus(detail.session_status ?? "terminated_limit");
            setConfidenceScore(detail.current_confidence ?? 0);
            setQuestionNumber(detail.question_count ?? 0);
            setReport(detail.final_report ?? null);
            return;
          }
        }
      }
      setError("Failed to load question. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  // Init: check session first, then load question
  useEffect(() => {
    const init = async () => {
      try {
        const info = await getSessionInfo(candidateId);
        if (info.session_status !== "active") {
          setSessionStatus(info.session_status);
          setConfidenceScore(info.current_confidence);
          setQuestionNumber(info.question_count);
          setReport(info.final_report);
          setLoading(false);
          return;
        }
      } catch {
        // 404 = no session yet, proceed to fetch question
      }
      await fetchNextQuestion();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  // Timer
  useEffect(() => {
    if (loading || sessionStatus !== "active" || result || !currentQuestion) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, loading, sessionStatus]);

  const handleSubmit = async (timedOut = false) => {
    if (!currentQuestion) return;
    clearInterval(timerRef.current!);
    setSubmitting(true);
    try {
      let answerText = timedOut ? "" : answer;
      if (currentQuestion.question_type === "MCQ") {
        answerText = timedOut ? "" : (selectedOption ?? "");
      }
      const submitted = await submitAnswer(currentQuestion.assessment_id, answerText);
      setResult({ score: submitted.score ?? 0, feedback: submitted.feedback });
    } catch {
      setError("Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  };

  // Render states
  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (error) return <Alert type="error" message={error} showIcon />;

  if (sessionStatus !== "active") {
    return (
      <TerminalScreen
        sessionStatus={sessionStatus}
        confidenceScore={confidenceScore}
        questionNumber={questionNumber}
        report={report}
      />
    );
  }

  if (!currentQuestion) return <Alert type="warning" message="No question available. Please try again." showIcon />;

  const timerPct = (timeLeft / TIMER_SECONDS) * 100;
  const isMCQ = currentQuestion.question_type === "MCQ";
  const isFillBlank = currentQuestion.question_type === "FILL_BLANK";
  const submitDisabled = isMCQ && selectedOption === null;

  return (
    <div>
      {/* Confidence bar */}
      <ConfidenceBar score={confidenceScore} />

      {/* Header row */}
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
          Q {String(questionNumber).padStart(2, "0")} · max 15
        </span>
        <span
          className="mono"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: timeLeft < 30 ? "#dc2626" : "var(--text-primary)",
            transition: "color 0.3s",
          }}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Timer bar */}
      <div style={{ height: 3, borderRadius: 999, background: "rgba(59,130,246,0.12)", marginBottom: 24, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${timerPct}%`,
            background: timeLeft < 30 ? "#dc2626" : "#2563eb",
            transition: "width 1s linear, background 0.3s",
          }}
        />
      </div>

      {/* Question card */}
      <GlassCard variant="elevated" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <StageBadge stage={currentQuestion.current_stage} />
          <SourceBadge source={currentQuestion.source} />
          <TypeBadge type={currentQuestion.question_type} />
        </div>
        <Title level={4} style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 18, marginBottom: isMCQ && currentQuestion.options ? 20 : 0 }}>
          {currentQuestion.question_text}
        </Title>
        {isMCQ && currentQuestion.options && !result && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 16 }} />
            <Radio.Group
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              style={{ width: "100%" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                {currentQuestion.options.map((opt) => (
                  <Radio
                    key={opt}
                    value={opt}
                    style={{ color: "var(--text-primary)", fontSize: 14, width: "100%", padding: "6px 0" }}
                  >
                    {opt}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </>
        )}
      </GlassCard>

      {/* Answer area */}
      {result ? (
        <div>
          <ScoreDisplay score={result.score} />
          <Button
            type="primary"
            size="large"
            block
            style={{ marginTop: 24, height: 52, fontWeight: 700 }}
            onClick={fetchNextQuestion}
          >
            Next Question
          </Button>
        </div>
      ) : (
        <div>
          {isFillBlank && (
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type the exact value, syntax, or command..."
              size="large"
              style={{ marginBottom: 16, fontFamily: "monospace", letterSpacing: "0.02em" }}
            />
          )}
          {!isMCQ && !isFillBlank && (
            <TextArea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              style={{ marginBottom: 16 }}
            />
          )}
          <Button
            type="primary"
            size="large"
            block
            loading={submitting}
            disabled={submitDisabled}
            onClick={() => handleSubmit(false)}
            style={{ height: 52, fontWeight: 700 }}
          >
            Submit Answer
          </Button>
        </div>
      )}
    </div>
  );
}
