import axios from "axios";
import type { Assessment, Candidate, GitHubVerification, InterrogationSession, JobStatus, NextQuestion, UploadResponse } from "./types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
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
  answer: string
): Promise<Assessment> {
  const { data } = await api.post<Assessment>(`/assessments/${assessmentId}/answer`, {
    answer,
  });
  return data;
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
