export interface Claim {
  id: number;
  skill_name: string;
  context: string;
}

export interface SkillConfidence {
  skill_name: string;
  confidence: number;
  status: "evaluating" | "evaluated";
  question_count: number;
}

export interface Candidate {
  id: number;
  name: string;
  email: string;
  claims: Claim[];
  average_score: number | null;
  skill_confidences: SkillConfidence[];
  tab_switch_count: number;
  integrity_status: "pass" | "fail";
}

export interface UploadResponse {
  candidate_id: number;
  job_id: string;
}

export interface JobStatus {
  job_id: string;
  status: "extracting" | "scraping" | "verifying" | "generating" | "ready" | "error";
  error?: string;
}

export type QuestionType = "MCQ" | "TROUBLESHOOT" | "FILL_BLANK" | "WHAT_IF" | "OPEN";
export type AssessmentStatus = "CONTINUE" | "TERMINATE_SUCCESS" | "TERMINATE_FAIL" | "TERMINATE_LIMIT";
export type SessionStatus = "active" | "terminated_success" | "terminated_fail" | "terminated_limit";
export type InterviewStage = "breadth" | "deepdive";

export interface Assessment {
  id: number;
  candidate_id: number;
  question_text: string;
  user_answer: string;
  score: number | null;
  feedback: string;
  source: "pdf" | "github";
  question_type?: QuestionType;
  options?: string[] | null;
  question_number?: number | null;
}

export interface NextQuestion {
  assessment_id: number;
  assessment_status: AssessmentStatus;
  current_confidence_score: number;
  question_number: number;
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  source: "pdf" | "github";
  session_status: SessionStatus;
  current_stage: InterviewStage;
}

export interface InterrogationSession {
  session_id: number;
  candidate_id: number;
  session_status: SessionStatus;
  current_confidence: number;
  question_count: number;
  final_report: string | null;
  tab_switch_count: number;
  integrity_status: "pass" | "fail";
}

export interface MatchedRepo {
  repo_name: string;
  branch: string;
  matched_claim: string;
  url: string;
  language?: string;
  match_type?: "project_match" | "skill_match";
  audit_languages?: string[];
  audit_resources?: string[];
}

export interface GitHubVerification {
  github_username: string;
  matched_repos: MatchedRepo[];
  verification_summary: string;
  github_skipped: boolean;
}

export interface Organization {
  id: string;
  name: string;
  admin_email: string;
  created_at: string;
}

export interface Invitation {
  token: string;
  candidate_email: string;
  status: "pending" | "started" | "completed";
  expires_at: string;
  created_at: string;
}

export interface OrgStats {
  total_candidates: number;
  avg_veridicus_score: number | null;
  flagged_count: number;
  pending_invites: number;
  completed_invites: number;
}

export interface PublicInvite {
  org_name: string;
  candidate_email: string;
  valid: boolean;
  expired: boolean;
}
