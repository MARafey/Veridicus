import axios from "axios";
import type { Assessment, Candidate, GitHubVerification, InterrogationSession, JobStatus, NextQuestion, Organization, Invitation, OrgStats, PublicInvite, UploadResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const api = axios.create({ baseURL: API_BASE });

// Cache the raw JWT for 55 minutes (NextAuth session default is 30 days, but we refresh often)
let _cachedToken: string | null = null;
let _tokenFetchedAt = 0;
const TOKEN_TTL_MS = 55 * 60 * 1000;

async function getRawToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now - _tokenFetchedAt < TOKEN_TTL_MS) return _cachedToken;
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) { _cachedToken = null; return null; }
    const { token } = await res.json();
    _cachedToken = token ?? null;
    _tokenFetchedAt = now;
    return _cachedToken;
  } catch {
    return null;
  }
}

// Attach the NextAuth-signed JWT (HS256, NEXTAUTH_SECRET) to every request
api.interceptors.request.use(async (config) => {
  const token = await getRawToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export async function uploadResume(
  name: string,
  email: string,
  file: File,
  githubUsername?: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("name", name);
  form.append("email", email);
  form.append("file", file);
  if (githubUsername) form.append("github_username", githubUsername);
  const { data } = await api.post<UploadResponse>("/candidates/upload", form);
  return data;
}

export async function getCandidates(): Promise<Candidate[]> {
  const { data } = await api.get<Candidate[]>("/candidates/");
  return data;
}

export async function getCandidate(id: number): Promise<Candidate> {
  const { data } = await api.get<Candidate>(`/candidates/${id}`);
  return data;
}

export async function getPipelineStatus(
  candidateId: number,
  jobId: string
): Promise<JobStatus> {
  const { data } = await api.get<JobStatus>(
    `/candidates/${candidateId}/status?job_id=${jobId}`
  );
  return data;
}

export async function getAssessments(candidateId: number): Promise<Assessment[]> {
  const { data } = await api.get<Assessment[]>(`/assessments/${candidateId}`);
  return data;
}

export async function submitAnswer(
  assessmentId: number,
  answer: string,
  timeTakenSeconds?: number
): Promise<Assessment> {
  const { data } = await api.post<Assessment>(`/assessments/${assessmentId}/answer`, {
    answer,
    time_taken_seconds: timeTakenSeconds ?? null,
  });
  return data;
}

export async function logTabSwitch(
  candidateId: number,
  count: number,
  timestamp: string
): Promise<void> {
  await api.post(`/assessments/${candidateId}/tab-switch`, { count, timestamp });
}

export async function terminateSession(
  candidateId: number,
  reason: string
): Promise<void> {
  await api.post(`/assessments/${candidateId}/terminate`, { reason });
}

export async function getGitHubVerification(
  candidateId: number
): Promise<GitHubVerification | null> {
  try {
    const { data } = await api.get<GitHubVerification>(
      `/candidates/${candidateId}/github-verification`
    );
    return data;
  } catch {
    return null;
  }
}

export async function deleteAssessment(assessmentId: number): Promise<void> {
  await api.delete(`/assessments/${assessmentId}`);
}

export async function deleteAllAssessments(candidateId: number): Promise<void> {
  await api.delete(`/assessments/candidate/${candidateId}/all`);
}

export async function flushDatabase(): Promise<void> {
  await api.post("/admin/flush");
}

export async function getCandidateReport(candidateId: number): Promise<CandidateReport> {
  const { data } = await api.get<CandidateReport>(`/admin/report/${candidateId}`);
  return data;
}

export interface CandidateReport {
  candidate: { id: number; name: string; email: string };
  claims: { skill_name: string; context: string }[];
  session: {
    status: string | null;
    confidence: number | null;
    question_count: number;
    final_report: string | null;
  };
  github: {
    username: string | null;
    skipped: boolean;
    matched_repos: string;
    verification_summary: string | null;
  };
  assessments: {
    question_number: number | null;
    question_type: string;
    question_text: string;
    user_answer: string;
    score: number | null;
    feedback: string;
    source: string;
  }[];
}

export interface SourceDoc {
  id: number;
  claim_id: number;
  skill_name: string;
  document_title: string;
  document_url: string;
}

export async function getSources(candidateId: number): Promise<SourceDoc[]> {
  const { data } = await api.get<SourceDoc[]>(`/candidates/${candidateId}/sources`);
  return data;
}

export async function getNextQuestion(candidateId: number): Promise<NextQuestion> {
  const { data } = await api.post<NextQuestion>(`/assessments/${candidateId}/next-question`);
  return data;
}

export async function getSessionInfo(candidateId: number): Promise<InterrogationSession> {
  const { data } = await api.get<InterrogationSession>(`/assessments/${candidateId}/session`);
  return data;
}

export async function getReport(candidateId: number): Promise<{ report: string }> {
  const { data } = await api.get<{ report: string }>(`/assessments/${candidateId}/report`);
  return data;
}

export async function reVerifyGithub(
  candidateId: number,
  githubUsername?: string
): Promise<{ job_id: string; candidate_id: number }> {
  const { data } = await api.post(`/candidates/${candidateId}/re-verify-github`, {
    github_username: githubUsername ?? null,
  });
  return data;
}

// ── Org / Tenant APIs ─────────────────────────────────────────────────────────

export async function getMyOrg(): Promise<Organization> {
  const { data } = await api.get<Organization>("/admin/orgs/me");
  return data;
}

export async function getOrgStats(): Promise<OrgStats> {
  const { data } = await api.get<OrgStats>("/admin/orgs/me/stats");
  return data;
}

export async function sendInvites(
  emails: string[],
  smtpUser: string,
  smtpPassword: string,
  options: {
    smtpHost?: string;
    smtpPort?: number;
    expiresInDays?: number;
    emailHtml?: string;
    emailSubject?: string;
  } = {}
): Promise<{ tokens: string[]; sent: number; invitations: Invitation[] }> {
  const { data } = await api.post("/admin/invite", {
    emails,
    smtp_user: smtpUser,
    smtp_password: smtpPassword,
    smtp_host: options.smtpHost ?? "smtp.gmail.com",
    smtp_port: options.smtpPort ?? 587,
    expires_in_days: options.expiresInDays ?? 7,
    email_html: options.emailHtml ?? null,
    email_subject: options.emailSubject ?? null,
  });
  return data;
}

export async function listInvites(): Promise<Invitation[]> {
  const { data } = await api.get<Invitation[]>("/admin/invites");
  return data;
}

export async function getInviteTemplate(): Promise<{ html: string; subject: string }> {
  const { data } = await api.get<{ html: string; subject: string }>("/admin/invite-template");
  return data;
}

// ── Public (no auth) ──────────────────────────────────────────────────────────

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
});

export async function getPublicInvite(token: string): Promise<PublicInvite> {
  const { data } = await publicApi.get<PublicInvite>(`/public/invite/${token}`);
  return data;
}

export async function startInvite(
  token: string,
  name: string,
  file: File,
  githubUsername?: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  if (githubUsername) form.append("github_username", githubUsername);
  const { data } = await publicApi.post<UploadResponse>(`/public/invite/${token}/start`, form);
  return data;
}
