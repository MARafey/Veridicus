"use client";

import { useEffect, useState, useRef } from "react";
import { Button, Input, Radio, Typography, Spin, Alert, Space } from "antd";
import { GithubOutlined, FileTextOutlined } from "@ant-design/icons";
import { getNextQuestion, getReport, getSessionInfo, submitAnswer } from "@/lib/api";
import type { NextQuestion, SessionStatus } from "@/lib/types";
import { useAntiCheat } from "@/hooks/useAntiCheat";
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
      background: isBreadth ? "var(--success-bg)" : "var(--error-bg)",
      border: isBreadth ? "1px solid var(--success-border)" : "1px solid var(--error-border)",
      color: isBreadth ? "var(--success)" : "var(--error)",
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
    MCQ:         { bg: "var(--purple-bg)",  color: "var(--purple)",  border: "var(--purple-border)" },
    TROUBLESHOOT:{ bg: "var(--error-bg)",   color: "var(--error)",   border: "var(--error-border)" },
    FILL_BLANK:  { bg: "var(--success-bg)", color: "var(--success)", border: "var(--success-border)" },
    WHAT_IF:     { bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)" },
    OPEN:        { bg: "var(--action-bg)",  color: "var(--text-muted)", border: "var(--action-border)" },
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
  const color = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--blue-500)";
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartTimeRef = useRef<number>(Date.now());
  // Ref so timer callback always calls the latest handleSubmit (avoids stale closure)
  const handleSubmitRef = useRef<(timedOut?: boolean) => Promise<void>>(() => Promise.resolve());

  const { tabSwitchCount, showWarningModal, dismissWarning, aiExtensionDetected } = useAntiCheat(candidateId);

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
        questionStartTimeRef.current = Date.now();
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

  const handleSubmit = async (timedOut = false) => {
    if (!currentQuestion) return;
    clearInterval(timerRef.current!);
    setSubmitting(true);
    setSubmitError(null);
    try {
      let answerText = timedOut ? "" : answer;
      if (currentQuestion.question_type === "MCQ") {
        answerText = timedOut ? "" : (selectedOption ?? "");
      }
      const timeTaken = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      const submitted = await submitAnswer(currentQuestion.assessment_id, answerText, timeTaken);
      setResult({ score: submitted.score ?? 0, feedback: submitted.feedback });
    } catch {
      setSubmitError("Could not submit answer — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Keep ref in sync with latest handleSubmit so timer never has a stale closure
  handleSubmitRef.current = handleSubmit;

  // Timer
  useEffect(() => {
    if (loading || sessionStatus !== "active" || result || !currentQuestion) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleSubmitRef.current(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, loading, sessionStatus]);

  // Render states
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <Spin size="large" />
        <p style={{ color: "var(--text-muted)", marginTop: 20, fontSize: 14, fontWeight: 500 }}>
          Loading your question…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load question"
        description={error}
        showIcon
        action={
          <Button size="small" onClick={fetchNextQuestion}>
            Retry
          </Button>
        }
      />
    );
  }

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
      {/* Tab-switch warning modal */}
      {showWarningModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(12, 27, 77, 0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(24px) saturate(200%)",
            WebkitBackdropFilter: "blur(24px) saturate(200%)",
            border: "2px solid var(--error-border)",
            borderRadius: 20, padding: "40px 44px", maxWidth: 460, textAlign: "center",
            boxShadow: "0 24px 80px var(--error-bg), 0 4px 24px rgba(15,42,110,0.12)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, color: "var(--error)" }}>⚠</div>
            <Title level={3} style={{ color: "var(--error)", marginBottom: 8, margin: "0 0 8px" }}>
              Integrity Warning
            </Title>
            <p style={{ color: "var(--text-secondary)", marginBottom: 6, fontSize: 15, fontWeight: 600 }}>
              Tab switching detected — Strike {tabSwitchCount} of 3.
            </p>
            <p style={{ color: "var(--text-muted)", marginBottom: 28, fontSize: 13, lineHeight: 1.6 }}>
              {tabSwitchCount === 1
                ? "This is your first warning. Please stay on this tab for the duration of the assessment."
                : "This is your final warning. One more tab switch will immediately terminate your session."}
            </p>
            <Button type="primary" danger size="large" onClick={dismissWarning} style={{ fontWeight: 700, height: 46, paddingInline: 36 }}>
              I Understand
            </Button>
          </div>
        </div>
      )}

      {/* AI extension warning */}
      {aiExtensionDetected && (
        <Alert
          type="warning"
          message="AI assistance extension detected. This session may be flagged for review."
          showIcon
          style={{ marginBottom: 16 }}
          banner
        />
      )}

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
            color: timeLeft < 30 ? "var(--error)" : "var(--text-primary)",
            transition: "color 0.3s",
          }}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Timer bar */}
      <div style={{ height: 3, borderRadius: 999, background: "var(--action-bg)", marginBottom: 24, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${timerPct}%`,
            background: timeLeft < 30 ? "var(--error)" : "var(--action)",
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
            <div style={{ height: 1, background: "rgba(37,99,235,0.12)", marginBottom: 16 }} />
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
          <ScoreDisplay score={result.score} feedback={result.feedback} />
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
          {submitError && (
            <Alert
              type="error"
              message={submitError}
              showIcon
              closable
              onClose={() => setSubmitError(null)}
              style={{ marginBottom: 12 }}
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
