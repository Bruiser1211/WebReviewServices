import crypto from "node:crypto";

import {
  parseCodexModel,
  parseReasoningEffort,
  type CodexModel,
  type ReasoningEffort
} from "@/lib/codex/options";
import { appConfig, bytesFromMb } from "@/lib/config";
import { getTaskDefinitions, type TaskDefinition } from "@/lib/tasks";

import { createJobTempDir, saveUploadedFile } from "./fs";
import { runReviewJob } from "./runner";
import { createJobRecord, deleteJobRecord, getJobRecord, scheduleJobCleanup } from "./store";

import type { JobRecord, JobSourceFile, JobUsageSnapshot } from "./types";

const validateFiles = (files: File[]) => {
  const maxBytes = bytesFromMb(appConfig.maxUploadMb);

  if (files.length === 0) {
    throw new Error("최소 1개의 파일을 업로드해야 합니다.");
  }

  if (files.length > appConfig.maxFilesPerJob) {
    throw new Error(`파일은 최대 ${appConfig.maxFilesPerJob}개까지 업로드할 수 있습니다.`);
  }

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const isAccepted =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      extension === "pdf" ||
      extension === "jpg" ||
      extension === "jpeg" ||
      extension === "png";

    if (!isAccepted) {
      throw new Error(`지원되지 않는 파일 형식입니다: ${file.name}`);
    }

    if (file.size > maxBytes) {
      throw new Error(`${file.name}: 파일 크기가 ${appConfig.maxUploadMb}MB 제한을 초과했습니다.`);
    }
  }
};

const buildInitialJobRecord = (
  jobId: string,
  model: CodexModel,
  reasoningEffort: ReasoningEffort,
  tasks: TaskDefinition[],
  sourceFiles: JobSourceFile[],
  tempDir: string
): JobRecord => {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + appConfig.jobTtlMinutes * 60 * 1000).toISOString();
  const tokenLimit =
    appConfig.usageTokenLimitPerJob > 0 ? appConfig.usageTokenLimitPerJob : null;
  const costLimitUsd =
    appConfig.usageCostLimitUsdPerJob > 0 ? appConfig.usageCostLimitUsdPerJob : null;
  const usage: JobUsageSnapshot = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedPromptTokens: 0,
    reasoningTokens: 0,
    inputCostUsd: 0,
    cachedInputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    tokenLimit,
    costLimitUsd,
    remainingTokens: tokenLimit,
    remainingCostUsd: costLimitUsd
  };

  return {
    jobId,
    model,
    reasoningEffort,
    taskKeys: tasks.map((task) => task.key),
    taskLabels: tasks.map((task) => task.label),
    currentTaskLabel: null,
    status: "queued",
    progressMessage: "작업을 준비하고 있습니다.",
    sourceFiles,
    tempDir,
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    results: [],
    usage,
    activityLogs: [
      {
        timestamp: createdAt,
        status: "queued",
        message: "작업이 생성되어 대기열에 등록되었습니다."
      }
    ],
    declarations: [],
    error: null
  };
};

export const createJobFromFormData = async (formData: FormData) => {
  const taskValues = formData
    .getAll("taskKeys")
    .filter((value): value is string => typeof value === "string");
  const tasks = getTaskDefinitions(taskValues);

  if (tasks.length === 0) {
    throw new Error("검토 작업을 1개 이상 선택해야 합니다.");
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  validateFiles(files);

  const readStringField = (fieldName: string) => {
    const value = formData.get(fieldName);
    return typeof value === "string" ? value : null;
  };

  const model = parseCodexModel(readStringField("model"));
  const reasoningEffort = parseReasoningEffort(readStringField("reasoningEffort"));

  const jobId = crypto.randomUUID();
  const tempDir = await createJobTempDir(jobId);
  const sourceFiles: JobSourceFile[] = [];

  for (const [index, file] of files.entries()) {
    sourceFiles.push(await saveUploadedFile(tempDir, file, index));
  }

  const record = buildInitialJobRecord(
    jobId,
    model,
    reasoningEffort,
    tasks,
    sourceFiles,
    tempDir
  );
  createJobRecord(record);
  scheduleJobCleanup(record.jobId, record.expiresAt);

  void runReviewJob(record.jobId);

  return record;
};

export const removeJob = async (jobId: string) => {
  const job = getJobRecord(jobId);
  if (!job) {
    return false;
  }

  await deleteJobRecord(jobId);
  return true;
};
