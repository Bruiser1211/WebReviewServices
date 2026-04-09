import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

import { appConfig } from "@/lib/config";
import type { ReviewChangeDeclaration } from "@/lib/jobs/types";
import type { TaskKey } from "@/lib/tasks";
import { taskDefinitions } from "@/lib/tasks";

type ReviewChangeFeedback = {
  feedbackType: "declared" | "accepted";
  itemId: string;
  taskKey: TaskKey;
  taskLabel: string;
  changeIndex: number;
  issueType: "error" | "risk" | "missing";
  location: string;
  originalText: string;
  revisedText: string;
  note: string;
  createdAt: string;
  submitterIp?: string;
  submitterName?: string;
};

type FeedbackGroup = {
  feedback: ReviewChangeFeedback;
  count: number;
};

type StoredFeedbackResult = {
  addedCount: number;
  declaredAddedCount: number;
  acceptedAddedCount: number;
  storePath: string;
  summaryPath: string;
};

type FeedbackReferenceRule = {
  taskKey: TaskKey;
  taskLabel: string;
  feedbackDirection: "declared" | "accepted" | "mixed";
  issueType: "error" | "risk" | "missing";
  originalPattern: string;
  revisedPattern: string;
  guidance: string;
  weightPercent: number;
  evidenceCount: number;
  generatedAt: string;
};

type FeedbackReferenceFile = {
  updatedAt: string;
  sourceItemCount: number;
  ruleCount: number;
  rules: FeedbackReferenceRule[];
};

type ConsolidationPayload = {
  rules?: Array<Omit<FeedbackReferenceRule, "generatedAt">>;
};

type SkillReflectionSectionEntry = {
  taskKey: TaskKey;
  taskLabel: string;
  skillName: string;
  entryCount: number;
  reflectionPath: string;
};

type SkillReflectionSectionFailure = {
  taskKey: string;
  taskLabel: string;
  skillName: string;
  reason: string;
};

type SkillReflectionResult = {
  updatedSections: SkillReflectionSectionEntry[];
  skippedSections: SkillReflectionSectionFailure[];
};

type ConsolidatedFeedbackResult = {
  archivedCount: number;
  referenceRuleCount: number;
  storePath: string;
  summaryPath: string;
  referencePath: string;
  archivePath: string;
  skillReflection: SkillReflectionResult;
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const summarizeText = (value: string, maxLength = 72) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
};

const toFeedback = (declaration: ReviewChangeDeclaration): ReviewChangeFeedback => ({
  feedbackType: "declared",
  itemId: declaration.itemId,
  taskKey: declaration.taskKey,
  taskLabel: declaration.taskLabel,
  changeIndex: declaration.changeIndex,
  issueType: declaration.issueType,
  location: declaration.location,
  originalText: declaration.originalText,
  revisedText: declaration.revisedText,
  note: declaration.declarationReason,
  createdAt: declaration.declaredAt,
  submitterIp: declaration.submitterIp,
  submitterName: declaration.submitterName
});

const normalizeSubmitterText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const summarizeSubmitterDeclarations = (feedbacks: ReviewChangeFeedback[]) => {
  const declaredBySubmitter = new Map<string, { submitterIp: string; submitterName: string; declarationCount: number }>();

  for (const feedback of feedbacks) {
    if (feedback.feedbackType !== "declared") {
      continue;
    }

    const submitterIp = normalizeSubmitterText(feedback.submitterIp) || "미확인";
    const submitterName = normalizeSubmitterText(feedback.submitterName) || "이름없음";
    const key = `${submitterIp}|${submitterName}`;
    const existing = declaredBySubmitter.get(key);
    if (existing) {
      existing.declarationCount += 1;
    } else {
      declaredBySubmitter.set(key, {
        submitterIp,
        submitterName,
        declarationCount: 1
      });
    }
  }

  return [...declaredBySubmitter.values()]
    .sort((a, b) => {
      if (b.declarationCount !== a.declarationCount) {
        return b.declarationCount - a.declarationCount;
      }

      return a.submitterName.localeCompare(b.submitterName);
    })
    .map((entry) => ({
      submitterIp: entry.submitterIp,
      submitterName: entry.submitterName,
      declarationCount: entry.declarationCount
    }));
};

const normalizeFeedback = (value: unknown): ReviewChangeFeedback | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ReviewChangeFeedback & ReviewChangeDeclaration>;

  if (candidate.feedbackType === "declared" || candidate.feedbackType === "accepted") {
    if (
      typeof candidate.itemId === "string" &&
      typeof candidate.taskKey === "string" &&
      typeof candidate.taskLabel === "string" &&
      typeof candidate.changeIndex === "number" &&
      (candidate.issueType === "error" || candidate.issueType === "risk" || candidate.issueType === "missing") &&
      typeof candidate.location === "string" &&
      typeof candidate.originalText === "string" &&
    typeof candidate.revisedText === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.createdAt === "string"
  ) {
    return {
      ...candidate,
      submitterIp: normalizeSubmitterText(candidate.submitterIp),
      submitterName: normalizeSubmitterText(candidate.submitterName)
    };
  }

    return null;
  }

  if (
    typeof candidate.itemId === "string" &&
    typeof candidate.taskKey === "string" &&
    typeof candidate.taskLabel === "string" &&
    typeof candidate.changeIndex === "number" &&
    (candidate.issueType === "error" || candidate.issueType === "risk" || candidate.issueType === "missing") &&
    typeof candidate.location === "string" &&
    typeof candidate.originalText === "string" &&
    typeof candidate.revisedText === "string" &&
    typeof candidate.declarationReason === "string" &&
    typeof candidate.declaredAt === "string"
  ) {
    return toFeedback(candidate as ReviewChangeDeclaration);
  }

  return null;
};

const buildGroupKey = (feedback: ReviewChangeFeedback) =>
  [
    feedback.feedbackType,
    feedback.taskKey,
    feedback.issueType,
    normalizeText(feedback.originalText),
    normalizeText(feedback.revisedText)
  ].join("::");

const buildPersistKey = (feedback: ReviewChangeFeedback) =>
  [
    feedback.feedbackType,
    feedback.itemId,
    feedback.taskKey,
    feedback.changeIndex,
    normalizeText(feedback.location),
    normalizeText(feedback.note),
    normalizeText(feedback.submitterIp ?? "미확인"),
    normalizeText(feedback.submitterName ?? "이름없음"),
    feedback.createdAt
  ].join("::");

const getFeedbackArtifactPaths = () => {
  const storePath = appConfig.feedbackStorePath;
  const summaryPath = storePath.replace(/\.json$/i, ".summary.json");
  const referencePath = storePath.replace(/\.json$/i, ".reference.json");
  const archivePath = storePath.replace(/\.json$/i, `.archive.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  return {
    storePath,
    summaryPath,
    referencePath,
    archivePath
  };
};

const resolveSkillFilePath = (skillName: string) => {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) {
    throw new Error("사용자 홈 경로를 찾을 수 없어 SKILL.md 경로를 결정하지 못했습니다.");
  }

  return path.join(home, ".codex", "skills", skillName, "SKILL.md");
};

const skillReflectionSectionMarkerStart = "<!-- codex-feedback-start -->";
const skillReflectionSectionMarkerEnd = "<!-- codex-feedback-end -->";
const skillReflectionMarkerRegex = new RegExp(
  `\\r?\\n?${skillReflectionSectionMarkerStart}[\\s\\S]*?${skillReflectionSectionMarkerEnd}\\r?\\n?`,
  "i"
);

const getIssueTypeLabel = (issueType: FeedbackReferenceRule["issueType"]) =>
  issueType === "risk" ? "리스크" : issueType === "missing" ? "누락" : "오류";

const getFeedbackDirectionLabel = (feedbackDirection: FeedbackReferenceRule["feedbackDirection"]) =>
  feedbackDirection === "declared"
    ? "미조치 선언"
    : feedbackDirection === "accepted"
      ? "조치 수용"
      : "미조치/조치 혼합";

const toSkillReflectionSection = (taskLabel: string, taskKey: TaskKey, rules: FeedbackReferenceRule[]) => {
  const now = new Date().toISOString();
  const sorted = [...rules].sort((a, b) => {
    if (b.evidenceCount !== a.evidenceCount) {
      return b.evidenceCount - a.evidenceCount;
    }
    return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  const heading = `## 조치/미조치 누적 반영 (${taskLabel})`;
  const intro = [
    "- 이 섹션은 조치/미조치 누적 데이터를 Codex가 약하게 정리한 근거입니다.",
    `- taskKey: ${taskKey}`,
    `- 생성일: ${now}`,
    "- 항목별 반영 비중은 기본 10%로 적용되며, 상위 기준/필수 요건과 충돌 시 우선순위를 따른다."
  ];

  const body = sorted.map((rule, index) => {
    const directionLabel = getFeedbackDirectionLabel(rule.feedbackDirection);
    const issueLabel = getIssueTypeLabel(rule.issueType);

    return [
      `${index + 1}. ${directionLabel} / ${issueLabel} / 근거 ${rule.evidenceCount}건`,
      `   - 원문 패턴: ${summarizeText(rule.originalPattern, 120)}`,
      `   - 수정안 패턴: ${summarizeText(rule.revisedPattern, 120)}`,
      `   - 적용 가이드: ${summarizeText(rule.guidance, 200)}`
    ].join("\n");
  });

  return [
    skillReflectionSectionMarkerStart,
    heading,
    ...intro,
    "",
    ...body,
    skillReflectionSectionMarkerEnd
  ].join("\n");
};

const updateSkillReferenceSection = async (
  skillPath: string,
  taskLabel: string,
  taskKey: TaskKey,
  rules: FeedbackReferenceRule[]
) => {
  const fileRaw = await fs.readFile(skillPath, "utf8");
  const section = toSkillReflectionSection(taskLabel, taskKey, rules);
  const hasExistingSection = skillReflectionMarkerRegex.test(fileRaw);
  const replacement = hasExistingSection
    ? fileRaw.replace(skillReflectionMarkerRegex, `\n${section}\n`)
    : `${fileRaw.trimEnd()}\n\n${section}\n`;

  await fs.writeFile(skillPath, replacement, "utf8");
};

const applySkillReflectionsFromRules = async (rules: FeedbackReferenceRule[]): Promise<SkillReflectionResult> => {
  const updatedSections: SkillReflectionSectionEntry[] = [];
  const skippedSections: SkillReflectionSectionFailure[] = [];
  const grouped = rules.reduce<Map<string, FeedbackReferenceRule[]>>((acc, rule) => {
    const current = acc.get(rule.taskKey);
    if (current) {
      current.push(rule);
      return acc;
    }

    acc.set(rule.taskKey, [rule]);
    return acc;
  }, new Map());

  for (const [taskKey, taskRules] of grouped.entries()) {
    const task = taskDefinitions[taskKey as TaskKey];
    if (!task) {
      skippedSections.push({
        taskKey,
        taskLabel: taskRules[0]?.taskLabel ?? taskKey,
        skillName: "",
        reason: "해당 taskKey에 매핑되는 스킬이 없습니다."
      });
      continue;
    }

    const skillPath = resolveSkillFilePath(task.skillName);
    try {
      await fs.access(skillPath);
      await updateSkillReferenceSection(skillPath, task.label, taskKey as TaskKey, taskRules);
      updatedSections.push({
        taskKey: taskKey as TaskKey,
        taskLabel: task.label,
        skillName: task.skillName,
        entryCount: taskRules.length,
        reflectionPath: skillPath
      });
    } catch (error) {
      skippedSections.push({
        taskKey: taskKey as TaskKey,
        taskLabel: task.label,
        skillName: task.skillName,
        reason: error instanceof Error ? error.message : "SKILL.md 반영 중 알 수 없는 오류"
      });
    }
  }

  return {
    updatedSections,
    skippedSections
  };
};

const normalizeReferenceRule = (value: unknown): FeedbackReferenceRule | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<FeedbackReferenceRule>;
  if (
    typeof candidate.taskKey === "string" &&
    typeof candidate.taskLabel === "string" &&
    (candidate.feedbackDirection === "declared" ||
      candidate.feedbackDirection === "accepted" ||
      candidate.feedbackDirection === "mixed") &&
    (candidate.issueType === "error" || candidate.issueType === "risk" || candidate.issueType === "missing") &&
    typeof candidate.originalPattern === "string" &&
    typeof candidate.revisedPattern === "string" &&
    typeof candidate.guidance === "string" &&
    typeof candidate.weightPercent === "number" &&
    Number.isFinite(candidate.weightPercent) &&
    typeof candidate.evidenceCount === "number" &&
    Number.isFinite(candidate.evidenceCount) &&
    typeof candidate.generatedAt === "string"
  ) {
    return {
      ...candidate,
      weightPercent: Math.max(candidate.weightPercent, 0),
      evidenceCount: Math.max(candidate.evidenceCount, 0)
    } as FeedbackReferenceRule;
  }

  return null;
};

const readFeedbackStore = async (): Promise<ReviewChangeFeedback[]> => {
  try {
    const raw = await fs.readFile(appConfig.feedbackStorePath, "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.map(normalizeFeedback).filter(Boolean) as ReviewChangeFeedback[] : [];
  } catch {
    return [];
  }
};

const readFeedbackReference = async (): Promise<FeedbackReferenceFile | null> => {
  try {
    const { referencePath } = getFeedbackArtifactPaths();
    const raw = await fs.readFile(referencePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<FeedbackReferenceFile>;
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.map(normalizeReferenceRule).filter((rule): rule is FeedbackReferenceRule => rule !== null)
      : [];

    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      sourceItemCount:
        typeof parsed.sourceItemCount === "number" && Number.isFinite(parsed.sourceItemCount)
          ? Math.max(parsed.sourceItemCount, 0)
          : 0,
      ruleCount: rules.length,
      rules
    };
  } catch {
    return null;
  }
};

const writeFeedbackSummary = async (
  summaryPath: string,
  feedbacks: ReviewChangeFeedback[],
  extra: Record<string, unknown> = {}
) => {
  const declarationSubmitterSummary = summarizeSubmitterDeclarations(feedbacks);

  const summary = {
    declarationSubmitterSummary,
    updatedAt: new Date().toISOString(),
    totalCount: feedbacks.length,
    declaredCount: feedbacks.filter((feedback) => feedback.feedbackType === "declared").length,
    acceptedCount: feedbacks.filter((feedback) => feedback.feedbackType === "accepted").length,
    recentItems: feedbacks
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20),
    ...extra
  };

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
};

const resolveCodexExecutable = () => {
  const explicitPath = process.env.CODEX_CLI_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  return process.platform === "win32" ? "codex.cmd" : "codex";
};

const runFeedbackConsolidationCodex = async (prompt: string, outputFilePath: string) => {
  const schemaPath = path.join(process.cwd(), "schemas", "feedback-playbook.schema.json");
  const codexExecutable = resolveCodexExecutable();
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputFilePath,
    "--model",
    "gpt-5.4-mini",
    "--config",
    'model_reasoning_effort="low"',
    "-"
  ];

  await new Promise<void>((resolve, reject) => {
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(codexExecutable.trim());
    const child = spawn(codexExecutable, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: needsShell
    });

    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const timeoutHandle = setTimeout(() => {
      killedByTimeout = true;
      child.kill();
    }, appConfig.openAiRequestTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`조치/미조치 데이터 정리용 codex 실행을 시작하지 못했습니다. ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);

      if (killedByTimeout) {
        reject(
          new Error(`조치/미조치 데이터 정리용 codex 요청 제한 시간(${Math.round(appConfig.openAiRequestTimeoutMs / 1000)}초)을 초과했습니다.`)
        );
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            [
              `조치/미조치 데이터 정리용 codex 실행이 실패했습니다. 종료 코드: ${code ?? "unknown"}`,
              stderr.trim(),
              stdout.trim()
            ]
              .filter(Boolean)
              .join("\n")
          )
        );
        return;
      }

      resolve();
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
};

const buildConsolidationPrompt = (groups: FeedbackGroup[]) => {
  const lines = groups.slice(0, 24).map(({ feedback, count }, index) => {
    return [
      `${index + 1}. 유형=${feedback.feedbackType === "declared" ? "미조치" : "조치 수용"}`,
      `taskKey=${feedback.taskKey}`,
      `taskLabel=${feedback.taskLabel}`,
      `issueType=${feedback.issueType}`,
      `반복횟수=${count}`,
      `위치=${summarizeText(feedback.location, 80)}`,
      `원문=${summarizeText(feedback.originalText, 120)}`,
      `수정안=${summarizeText(feedback.revisedText, 120)}`,
      `비고=${summarizeText(feedback.note, 120)}`
    ].join(" / ");
  });

  return [
    "당신은 한국어 내부 문서 검토 시스템의 사용자 판단 누적 데이터를 정리하는 역할이다.",
    "목표는 이후 분석 프롬프트에서 약한 참조 기준으로 쓸 수 있는 규칙만 추려내는 것이다.",
    "중요 규칙:",
    "1. 반환 규칙은 약한 참고용이다. 각 항목의 weightPercent는 반드시 10으로 고정한다.",
    "2. 반복되거나 명확한 패턴만 남기고, 모호하거나 일회성인 판단은 제외한다.",
    "3. 법령, 지침, 계약상 필수 요건을 뒤집는 규칙을 만들지 않는다.",
    "4. guidance는 짧고 분명한 한국어 1문장으로 작성한다.",
    "5. originalPattern, revisedPattern은 대표 패턴만 간결하게 적는다.",
    "6. feedbackDirection은 declared, accepted, mixed 중 하나다. 혼합 근거가 없으면 declared 또는 accepted를 쓴다.",
    "7. evidenceCount는 해당 규칙이 기대는 입력 반복 수다.",
    "8. taskKey와 taskLabel은 입력에서 보이는 값만 사용한다.",
    "",
    "입력 데이터:",
    ...lines
  ].join("\n");
};

export const appendReviewFeedbacksToStore = async (
  feedbacks: Array<ReviewChangeFeedback | ReviewChangeDeclaration>
): Promise<StoredFeedbackResult> => {
  const { storePath, summaryPath } = getFeedbackArtifactPaths();

  if (feedbacks.length === 0) {
    return {
      addedCount: 0,
      declaredAddedCount: 0,
      acceptedAddedCount: 0,
      storePath,
      summaryPath
    };
  }

  await fs.mkdir(path.dirname(storePath), { recursive: true });

  const normalizedIncoming = feedbacks
    .map((feedback) => normalizeFeedback(feedback))
    .filter((feedback): feedback is ReviewChangeFeedback => feedback !== null);

  if (normalizedIncoming.length === 0) {
    return {
      addedCount: 0,
      declaredAddedCount: 0,
      acceptedAddedCount: 0,
      storePath,
      summaryPath
    };
  }

  const existing = await readFeedbackStore();
  const seenKeys = new Set(existing.map(buildPersistKey));
  const merged = [...existing];
  let addedCount = 0;
  let declaredAddedCount = 0;
  let acceptedAddedCount = 0;

  for (const feedback of normalizedIncoming) {
    const key = buildPersistKey(feedback);
    if (seenKeys.has(key)) {
      continue;
    }

    merged.push(feedback);
    seenKeys.add(key);
    addedCount += 1;
    if (feedback.feedbackType === "declared") {
      declaredAddedCount += 1;
    } else {
      acceptedAddedCount += 1;
    }
  }

  await fs.writeFile(storePath, JSON.stringify(merged, null, 2), "utf8");
  await writeFeedbackSummary(summaryPath, merged);

  return {
    addedCount,
    declaredAddedCount,
    acceptedAddedCount,
    storePath,
    summaryPath
  };
};

export const consolidateReviewFeedbacks = async (): Promise<ConsolidatedFeedbackResult> => {
  const { storePath, summaryPath, referencePath, archivePath } = getFeedbackArtifactPaths();
  const feedbacks = await readFeedbackStore();

  if (feedbacks.length === 0) {
    throw new Error("정리할 조치/미조치 데이터가 없습니다.");
  }

  const grouped = feedbacks.reduce<Map<string, FeedbackGroup>>((acc, feedback) => {
    const key = buildGroupKey(feedback);
    const current = acc.get(key);

    if (current) {
      current.count += 1;
      if (new Date(feedback.createdAt).getTime() > new Date(current.feedback.createdAt).getTime()) {
        current.feedback = feedback;
      }
      return acc;
    }

    acc.set(key, {
      feedback,
      count: 1
    });
    return acc;
  }, new Map());

  const groups = [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return new Date(b.feedback.createdAt).getTime() - new Date(a.feedback.createdAt).getTime();
  });

  const prompt = buildConsolidationPrompt(groups);
  const tempOutputPath = referencePath.replace(/\.json$/i, ".tmp.json");

  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await runFeedbackConsolidationCodex(prompt, tempOutputPath);

  let parsed: ConsolidationPayload;
  try {
    const raw = await fs.readFile(tempOutputPath, "utf8");
    parsed = JSON.parse(raw) as ConsolidationPayload;
  } finally {
    await fs.rm(tempOutputPath, { force: true });
  }

  const generatedAt = new Date().toISOString();
  const rules = Array.isArray(parsed.rules)
    ? parsed.rules
        .map((rule) =>
          normalizeReferenceRule({
            ...rule,
            weightPercent: 10,
            generatedAt
          })
        )
        .filter((rule): rule is FeedbackReferenceRule => rule !== null)
    : [];

  if (rules.length === 0) {
    throw new Error("조치/미조치 데이터를 정리했지만 참조 규칙이 생성되지 않았습니다.");
  }

  const skillReflection = await applySkillReflectionsFromRules(rules);
  if (skillReflection.updatedSections.length === 0) {
    throw new Error("SKILL.md 반영 대상이 없어 정리를 중단했습니다.");
  }

  const referenceFile: FeedbackReferenceFile = {
    updatedAt: generatedAt,
    sourceItemCount: feedbacks.length,
    ruleCount: rules.length,
    rules
  };

  await fs.writeFile(referencePath, JSON.stringify(referenceFile, null, 2), "utf8");
  await fs.writeFile(archivePath, JSON.stringify(feedbacks, null, 2), "utf8");
  await fs.writeFile(storePath, JSON.stringify([], null, 2), "utf8");
  await writeFeedbackSummary(summaryPath, [], {
    lastConsolidatedAt: generatedAt,
    lastArchivePath: archivePath,
    referencePath,
    referenceRuleCount: rules.length
  });

  return {
    archivedCount: feedbacks.length,
    referenceRuleCount: rules.length,
    storePath,
    summaryPath,
    referencePath,
    archivePath,
    skillReflection
  };
};

export const loadDeclarationGuidance = async (taskKey: TaskKey) => {
  const [feedbacks, referenceFile] = await Promise.all([readFeedbackStore(), readFeedbackReference()]);
  const relevant = feedbacks.filter((feedback) => feedback.taskKey === taskKey);
  const referenceRules = (referenceFile?.rules ?? [])
    .filter((rule) => rule.taskKey === taskKey)
    .sort((a, b) => {
      if (b.evidenceCount !== a.evidenceCount) {
        return b.evidenceCount - a.evidenceCount;
      }

      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    })
    .slice(0, 6);

  if (relevant.length === 0 && referenceRules.length === 0) {
    return "";
  }

  const grouped = relevant.reduce<Map<string, FeedbackGroup>>((acc, feedback) => {
    const key = buildGroupKey(feedback);
    const current = acc.get(key);

    if (current) {
      current.count += 1;
      if (new Date(feedback.createdAt).getTime() > new Date(current.feedback.createdAt).getTime()) {
        current.feedback = feedback;
      }
      return acc;
    }

    acc.set(key, {
      feedback,
      count: 1
    });
    return acc;
  }, new Map());

  const groups = [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return new Date(b.feedback.createdAt).getTime() - new Date(a.feedback.createdAt).getTime();
  });

  const declaredGroups = groups.filter((group) => group.feedback.feedbackType === "declared").slice(0, 4);
  const acceptedGroups = groups.filter((group) => group.feedback.feedbackType === "accepted").slice(0, 4);

  const toIssueLabel = (issueType: ReviewChangeFeedback["issueType"]) =>
    issueType === "risk" ? "리스크" : issueType === "missing" ? "누락" : "오류";

  const toFeedbackDirectionLabel = (feedbackDirection: FeedbackReferenceRule["feedbackDirection"]) =>
    feedbackDirection === "declared"
      ? "미조치 선언"
      : feedbackDirection === "accepted"
        ? "조치 수용"
        : "조치/미조치 혼합";

  const referenceLines = referenceRules.map((rule) => {
    return `- 누적 정리 규칙 / ${toFeedbackDirectionLabel(rule.feedbackDirection)} / ${toIssueLabel(
      rule.issueType
    )} / 가중치 ${rule.weightPercent}% / 근거 ${rule.evidenceCount}건 / 원문 ${summarizeText(
      rule.originalPattern
    )} / 수정안 ${summarizeText(rule.revisedPattern)} / 참고 ${summarizeText(rule.guidance, 120)}`;
  });

  const declaredLines = declaredGroups.map(({ feedback, count }) => {
    const frequencyLabel = count >= 3 ? `반복 ${count}회` : count === 2 ? "반복 2회" : "최근 1회";
    return `- 미조치 선언 / ${frequencyLabel} / ${toIssueLabel(feedback.issueType)} / 위치 ${summarizeText(
      feedback.location,
      40
    )} / 원문 ${summarizeText(feedback.originalText)} / 수정안 ${summarizeText(
      feedback.revisedText
    )} / 사유 ${summarizeText(feedback.note)}`;
  });

  const acceptedLines = acceptedGroups.map(({ feedback, count }) => {
    const strengthLabel = count >= 3 ? "약한 긍정 누적 강함" : count === 2 ? "약한 긍정 누적 중간" : "약한 긍정 1회";
    return `- 조치 수용 / ${strengthLabel} / ${toIssueLabel(feedback.issueType)} / 위치 ${summarizeText(
      feedback.location,
      40
    )} / 원문 ${summarizeText(feedback.originalText)} / 수정안 ${summarizeText(feedback.revisedText)}`;
  });

  const sections: string[] = [];

  if (referenceLines.length > 0) {
    sections.push(
      "## 누적 사용자 판단 정리 참고",
      "- 아래 내용은 조치/미조치 누적 데이터를 Codex로 정리한 참조 규칙이다. 각 항목은 약 10% 수준으로만 반영한다.",
      "- 다만 법령, 지침, 계약상 필수 요건처럼 객관 근거가 더 강하면 그 근거를 우선한다.",
      ...referenceLines
    );
  }

  if (relevant.length > 0) {
    sections.push(
      "## 최근 사용자 판단 참고",
      "- 아래 내용은 최근 누적된 판단이다. 같은 패턴의 미조치 선언이 반복되면 해당 수정 제안을 약 10% 수준으로 더 보수적으로 본다.",
      "- 미조치 선언이 없는 항목은 조치 수용으로 본다. 같은 패턴이 누적되면 해당 수정 제안의 타당성을 약 10% 수준으로 긍정 강화한다.",
      "- 다만 법령, 지침, 계약상 필수 요건처럼 객관 근거가 더 강하면 그 근거를 우선한다.",
      ...declaredLines,
      ...acceptedLines
    );
  }

  return sections.join("\n");
};
