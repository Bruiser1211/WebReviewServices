import type { CodexModel, ReasoningEffort } from "@/lib/codex/options";
import type { TaskKey } from "@/lib/tasks";

export type JobStatus =
  | "queued"
  | "validating_upload"
  | "extracting_text"
  | "running_review"
  | "summarizing_result"
  | "completed"
  | "failed"
  | "expired";

export type JobErrorCode =
  | "upload_validation_error"
  | "file_processing_error"
  | "ocr_error"
  | "codex_execution_error"
  | "result_format_error"
  | "cleanup_error"
  | "usage_limit_exceeded";

export type JobSourceFile = {
  name: string;
  storedName: string;
  path: string;
  mimeType: string;
  size: number;
};

export type ReviewResult = {
  summary: string;
  decision: string;
  changeItems: ReviewChangeItem[];
  missingItems: string[];
  risks: string[];
  evidence: string[];
};

export type ReviewChangeItem = {
  issueType?: "error" | "risk" | "missing";
  location: string;
  originalText: string;
  revisedText: string;
  reason: string;
};

export type OpenAITokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  reasoningTokens: number;
};

export type OpenAICostUsage = {
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  totalUsd: number;
};

export type TaskUsageResult = {
  tokens: OpenAITokenUsage;
  cost: OpenAICostUsage;
};

export type JobUsageSnapshot = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  reasoningTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  tokenLimit: number | null;
  costLimitUsd: number | null;
  remainingTokens: number | null;
  remainingCostUsd: number | null;
};

export type TaskReviewResult = {
  taskKey: TaskKey;
  taskLabel: string;
  review: ReviewResult;
  usage: TaskUsageResult;
};

export type JobError = {
  code: JobErrorCode;
  message: string;
  details?: string;
  logFileName?: string;
};

export type JobActivityLog = {
  timestamp: string;
  status: JobStatus;
  message: string;
};

export type ReviewChangeDeclaration = {
  itemId: string;
  taskKey: TaskKey;
  taskLabel: string;
  changeIndex: number;
  issueType: "error" | "risk" | "missing";
  location: string;
  originalText: string;
  revisedText: string;
  declarationReason: string;
  declaredAt: string;
  submitterIp?: string;
  submitterName?: string;
};

export type JobRecord = {
  jobId: string;
  model: CodexModel;
  reasoningEffort: ReasoningEffort;
  taskKeys: TaskKey[];
  taskLabels: string[];
  currentTaskLabel: string | null;
  status: JobStatus;
  progressMessage: string;
  sourceFiles: JobSourceFile[];
  tempDir: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  results: TaskReviewResult[];
  usage: JobUsageSnapshot;
  activityLogs: JobActivityLog[];
  declarations: ReviewChangeDeclaration[];
  error: JobError | null;
};

export type JobSnapshot = Omit<JobRecord, "tempDir">;

export type JobProgressEvent = {
  jobId: string;
  status: JobStatus;
  progressMessage: string;
  timestamp: string;
  resultAvailable: boolean;
};
