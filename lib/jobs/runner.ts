import path from "node:path";
import { promises as fs } from "node:fs";

import { getCodexModelLabel, getReasoningEffortLabel } from "@/lib/codex/options";
import { CodexExecError, runCodexExec } from "@/lib/codex/exec";
import { getTaskDefinition } from "@/lib/tasks";

import { loadDeclarationGuidance } from "./declarations";
import { extractJobInputs } from "./extract";
import { writeTextArtifact } from "./fs";
import { updateJobRecord } from "./store";

import type { JobRecord, JobUsageSnapshot, TaskReviewResult } from "./types";

const FAILURE_LOG_FILE_NAME = "failure-log.txt";

const hasAnyKeyword = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const getTaskApplicability = (
  taskKey: string,
  extractedText: string,
  fileNames: string[]
) => {
  const normalizedText = extractedText.toLowerCase();
  const normalizedFileNames = fileNames.join(" ").toLowerCase();
  const combinedText = `${normalizedFileNames}\n${normalizedText}`;

  // If we only have image inputs or text extraction is too weak, avoid false skips.
  if (normalizedText.trim().length < 80) {
    return {
      shouldRun: true,
      reason: "추출 텍스트가 충분하지 않아 적용 여부를 단정하지 않고 검토를 진행합니다."
    };
  }

  if (taskKey === "contractClauseReview") {
    const keywords = [
      "계약",
      "조항",
      "갑",
      "을",
      "손해배상",
      "지체상금",
      "해지",
      "비밀유지",
      "분쟁",
      "협약"
    ];

    if (!hasAnyKeyword(combinedText, keywords)) {
      return {
        shouldRun: false,
        reason: "계약 조항 검토에 해당하는 문구가 뚜렷하지 않아 건너뜁니다."
      };
    }
  }

  if (taskKey === "contractExpenditureCheck") {
    const keywords = [
      "계약",
      "지출",
      "예산",
      "집행",
      "증빙",
      "정산",
      "지급",
      "대금",
      "세금계산서",
      "견적",
      "원"
    ];

    if (!hasAnyKeyword(combinedText, keywords)) {
      return {
        shouldRun: false,
        reason: "계약/지출 기준 판정에 해당하는 문구가 뚜렷하지 않아 건너뜁니다."
      };
    }
  }

  if (taskKey === "expenditureGuide") {
    const keywords = [
      "지출",
      "결의",
      "품의",
      "예산",
      "집행",
      "증빙",
      "결재",
      "정산",
      "카드",
      "세금계산서"
    ];

    if (!hasAnyKeyword(combinedText, keywords)) {
      return {
        shouldRun: false,
        reason: "지출결의 안내에 해당하는 문구가 뚜렷하지 않아 건너뜁니다."
      };
    }
  }

  return {
    shouldRun: true,
    reason: "관련 문구가 확인되어 검토를 진행합니다."
  };
};

const buildPrompt = (
  job: JobRecord,
  taskLabel: string,
  skillName: string,
  userGoal: string,
  outputFocus: string[],
  extractedText: string,
  warnings: string[],
  declarationGuidance: string
) => {
  const warningBlock =
    warnings.length > 0
      ? `## 주의사항\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "## 주의사항\n- 없음";

  const textBlock =
    extractedText.length > 0
      ? `## 추출된 문서 내용\n${extractedText}`
      : "## 추출된 문서 내용\n- 텍스트 추출본이 없습니다. 첨부 이미지와 파일 메타데이터를 참고해 판단하세요.";

  return [
    `Use the \`${skillName}\` skill.`,
    "Do not modify files. Analyze only.",
    "Write the final answer in Korean.",
    "Return only the structured JSON matching the provided schema.",
    "",
    "## 작업",
    `- 작업명: ${taskLabel}`,
    `- 목적: ${userGoal}`,
    `- 출력 중점: ${outputFocus.join(", ")}`,
    "",
    "## 파일 목록",
    ...job.sourceFiles.map(
      (file) => `- ${file.name} (${file.mimeType}, ${Math.ceil(file.size / 1024)} KB)`
    ),
    "",
    warningBlock,
    "",
    textBlock,
    declarationGuidance ? `\n${declarationGuidance}\n` : "",
    "",
    "## 출력 규칙",
    "- summary: 전체 상황을 2~4문장으로 요약",
    "- decision: 최종 판단 또는 현재 결론",
    `- 현재 검토는 '${taskLabel}'에만 집중하고, 다른 검토 항목(공문 검토/계약 조항 검토/계약·지출 기준 판정/지출결의 안내)에 해당하는 내용은 포함하지 말 것`,
    "- 어떤 이슈가 더 적절히 다른 검토 항목에 속하면 현재 결과에서 제외할 것",
    "- changeItems는 실제 오류, 법적/행정 리스크, 의미 왜곡, 필수 항목 누락 등 실질 이슈가 있을 때만 작성",
    "- 기관 내부에서 통용되는 표기 관행(날짜 구분 기호, 한글/숫자 혼용, 금액 띄어쓰기)은 의미상 문제가 없으면 수정 제안 금지",
    "- 제목/표제의 인용부호(작은따옴표, 큰따옴표)와 구두점은 의미 혼동이나 기준 위반이 없으면 수정 제안 금지",
    "- '쉽게 이해'와 '재미있게 습득'처럼 기획 의도에 따른 표현 차이는 오류로 보지 말 것",
    "- 문서 원문이 이미 기관 기준에 부합하거나 허용 가능한 표현이면 changeItems에 넣지 말 것",
    "- 단순 문체 취향, 서식 미세 차이, 가독성 선호 수준의 의견은 수정 항목으로 제시하지 말 것",
    "- 원문과 수정안이 모두 문법/의미상 성립하고, 차이가 정책/기획 판단(예: 강조 관점, 표현 톤, 전달 전략)이라면 수정 항목으로 제시하지 말 것",
    "- 의미를 바꾸는 제안은 법령, 지침, 계약조건, 명시 요구사항 등 객관 근거가 있을 때만 허용",
    "- PDF 추출 텍스트는 인코딩/추출 노이즈가 있을 수 있으므로 단일 글자 이상치(예: ㅗ 등)만으로 오탈자 판정 금지",
    "- 오탈자 판정은 같은 패턴이 2회 이상 반복되거나, 문맥상 명백한 의미 훼손이 있을 때만 허용",
    "- 추출 노이즈가 의심되는 항목은 changeItems가 아니라 risks 또는 missingItems에 확인 필요로 기록",
    "- changeItems: 수정 또는 보완이 필요한 사항을 1건씩 배열로 정리",
    "- changeItems[].issueType: 오류는 error, 리스크는 risk, 누락은 missing으로 분류",
    "- changeItems[].location: 쪽수, 항목명, 문단 첫 구절 등으로 위치를 특정",
    "- changeItems[].originalText: 문서 원문을 가능한 그대로 인용",
    "- changeItems[].revisedText: 원문에 대응하는 수정안 또는 권장 문안",
    "- changeItems[].reason: 왜 바꿔야 하는지 사유를 1~3문장으로 설명",
    "- 하나의 changeItems 항목에는 하나의 수정사항만 넣고, 여러 수정사항을 합치지 말 것",
    "- missingItems: 추가로 필요한 서류 또는 확인사항",
    "- risks: 주의해야 할 리스크",
    "- evidence: 최종 판단을 뒷받침하는 핵심 근거",
    "- evidence/missingItems/risks의 각 항목은 반드시 근거 위치를 포함해 작성",
    "- 위치 형식 예시: [위치: 2쪽 과업내용 > 행사일정] ...",
    "- changeItems가 없으면 빈 배열을 반환하고, summary와 decision에서 큰 수정사항이 없음을 분명히 적을 것"
  ].join("\n");
};

const updateStage = (
  jobId: string,
  status: JobRecord["status"],
  progressMessage: string,
  currentTaskLabel: string | null
) => {
  const timestamp = new Date().toISOString();
  const logMessage = currentTaskLabel
    ? `${currentTaskLabel} - ${progressMessage}`
    : progressMessage;

  updateJobRecord(jobId, (job) => ({
    ...job,
    status,
    progressMessage,
    currentTaskLabel,
    updatedAt: timestamp,
    activityLogs: [
      ...job.activityLogs,
      {
        timestamp,
        status,
        message: logMessage
      }
    ]
  }));
};

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const calculateUsageSnapshot = (
  results: TaskReviewResult[],
  tokenLimit: number | null,
  costLimitUsd: number | null
): JobUsageSnapshot => {
  const totals = results.reduce(
    (acc, taskResult) => ({
      promptTokens: acc.promptTokens + taskResult.usage.tokens.promptTokens,
      completionTokens: acc.completionTokens + taskResult.usage.tokens.completionTokens,
      totalTokens: acc.totalTokens + taskResult.usage.tokens.totalTokens,
      cachedPromptTokens: acc.cachedPromptTokens + taskResult.usage.tokens.cachedPromptTokens,
      reasoningTokens: acc.reasoningTokens + taskResult.usage.tokens.reasoningTokens,
      inputCostUsd: roundUsd(acc.inputCostUsd + taskResult.usage.cost.inputUsd),
      cachedInputCostUsd: roundUsd(
        acc.cachedInputCostUsd + taskResult.usage.cost.cachedInputUsd
      ),
      outputCostUsd: roundUsd(acc.outputCostUsd + taskResult.usage.cost.outputUsd),
      totalCostUsd: roundUsd(acc.totalCostUsd + taskResult.usage.cost.totalUsd)
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedPromptTokens: 0,
      reasoningTokens: 0,
      inputCostUsd: 0,
      cachedInputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0
    }
  );

  const remainingTokens = tokenLimit === null ? null : Math.max(tokenLimit - totals.totalTokens, 0);
  const remainingCostUsd =
    costLimitUsd === null ? null : roundUsd(Math.max(costLimitUsd - totals.totalCostUsd, 0));

  return {
    ...totals,
    tokenLimit,
    costLimitUsd,
    remainingTokens,
    remainingCostUsd
  };
};

const appendTaskResult = (jobId: string, taskResult: TaskReviewResult) => {
  return updateJobRecord(jobId, (job) => ({
    ...job,
    results: [...job.results, taskResult],
    usage: calculateUsageSnapshot(
      [...job.results, taskResult],
      job.usage.tokenLimit,
      job.usage.costLimitUsd
    ),
    updatedAt: new Date().toISOString()
  }));
};

const getUsageLimitViolation = (usage: JobUsageSnapshot) => {
  if (usage.tokenLimit !== null && usage.totalTokens > usage.tokenLimit) {
    return "tokenLimitExceeded";
  }

  if (usage.costLimitUsd !== null && usage.totalCostUsd > usage.costLimitUsd) {
    return "costLimitExceeded";
  }

  return null;
};

const failByUsageLimit = (jobId: string, message: string) =>
  updateJobRecord(jobId, (job) => {
    const timestamp = new Date().toISOString();
    return {
    ...job,
    results: [],
    status: "failed",
    progressMessage: message,
    error: {
      code: "usage_limit_exceeded",
      message
    },
    updatedAt: timestamp,
    activityLogs: [
      ...job.activityLogs,
      {
        timestamp,
        status: "failed",
        message
      }
    ]
  };
});

const buildFailureLog = (
  job: JobRecord,
  error: unknown,
  currentTaskKey: string | null,
  currentTaskLabel: string | null
) => {
  const sections = [
    `Job ID: ${job.jobId}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Model: ${getCodexModelLabel(job.model)}`,
    `Reasoning Effort: ${getReasoningEffortLabel(job.reasoningEffort)}`,
    `Current Task: ${
      currentTaskLabel
        ? `${currentTaskLabel}${currentTaskKey ? ` (${currentTaskKey})` : ""}`
        : "n/a"
    }`,
    `Source Files: ${job.sourceFiles.map((file) => file.name).join(", ") || "n/a"}`
  ];

  if (error instanceof CodexExecError) {
    sections.push(error.toLogString());
  } else if (error instanceof Error) {
    sections.push(
      [
        `Error: ${error.message}`,
        error.stack ? `STACK\n${error.stack}` : null
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  } else {
    sections.push(`Error: ${String(error)}`);
  }

  return sections.join("\n\n");
};

const persistFailureLog = async (
  job: JobRecord,
  error: unknown,
  currentTaskKey: string | null,
  currentTaskLabel: string | null
) => {
  try {
    await writeTextArtifact(
      job.tempDir,
      FAILURE_LOG_FILE_NAME,
      buildFailureLog(job, error, currentTaskKey, currentTaskLabel)
    );
    return FAILURE_LOG_FILE_NAME;
  } catch {
    return null;
  }
};

export const runReviewJob = async (jobId: string) => {
  const job = updateJobRecord(jobId, (current) => {
    const timestamp = new Date().toISOString();
    return {
    ...current,
    status: "extracting_text",
    progressMessage: "문서 내용을 추출하고 있습니다.",
    currentTaskLabel: null,
    updatedAt: timestamp,
    activityLogs: [
      ...current.activityLogs,
      {
        timestamp,
        status: "extracting_text",
        message: "문서 내용을 추출하고 있습니다."
      }
    ]
  };
});

  if (!job) {
    return;
  }

  let currentTaskKey: string | null = null;
  let currentTaskLabel: string | null = null;
  let ranTaskCount = 0;
  let skippedTaskCount = 0;

  try {
    const extraction = await extractJobInputs(job);
    updateStage(
      jobId,
      "extracting_text",
      "추출된 내용을 정리하고 작업별 실행을 준비하고 있습니다.",
      null
    );

    for (const [index, taskKey] of job.taskKeys.entries()) {
      const task = getTaskDefinition(taskKey);
      if (!task) {
        throw new Error(`알 수 없는 작업 유형입니다: ${taskKey}`);
      }

      currentTaskKey = task.key;
      currentTaskLabel = task.label;

      updateStage(
        jobId,
        "running_review",
        `검토 작업 실행 중 (${index + 1}/${job.taskKeys.length}): ${task.label}`,
        task.label
      );

      const applicability = getTaskApplicability(
        task.key,
        extraction.extractedText,
        job.sourceFiles.map((file) => file.name)
      );
      if (!applicability.shouldRun) {
        skippedTaskCount += 1;
        updateStage(jobId, "running_review", applicability.reason, task.label);
        continue;
      }

      updateStage(
        jobId,
        "running_review",
        "분석 요청을 전송하고 응답을 기다리고 있습니다.",
        task.label
      );
      const declarationGuidance = await loadDeclarationGuidance(task.key);

      const outputFilePath = path.join(job.tempDir, `review-result-${task.key}.json`);
      const { review, usage } = await runCodexExec({
        cwd: job.tempDir,
        prompt: buildPrompt(
          job,
          task.label,
          task.skillName,
          task.userGoal,
          task.outputFocus,
          extraction.extractedText,
          extraction.warnings,
          declarationGuidance
        ),
        outputFilePath,
        imagePaths: extraction.imagePaths,
        model: job.model,
        reasoningEffort: job.reasoningEffort
      });

      await fs.writeFile(
        path.join(job.tempDir, `normalized-result-${task.key}.json`),
        JSON.stringify({ review, usage }, null, 2),
        "utf8"
      );
      updateStage(jobId, "running_review", "응답을 정리하고 결과를 저장했습니다.", task.label);

      const updatedJob = appendTaskResult(jobId, {
        taskKey: task.key,
        taskLabel: task.label,
        review,
        usage
      });
      ranTaskCount += 1;

      if (!updatedJob) {
        return;
      }

      const usageViolation = getUsageLimitViolation(updatedJob.usage);
      if (usageViolation) {
        const violationMessage =
          usageViolation === "tokenLimitExceeded"
            ? "설정된 토큰 한도를 초과했습니다."
            : "설정된 요금 한도를 초과했습니다.";

        failByUsageLimit(
          jobId,
          `한도 초과로 작업이 중단되었습니다: ${violationMessage}`
        );
        return;
      }
    }

    updateStage(jobId, "summarizing_result", "결과를 정리하고 있습니다.", null);

    updateJobRecord(jobId, (current) => {
      const timestamp = new Date().toISOString();
      return {
      ...current,
      status: "completed",
      progressMessage:
        skippedTaskCount > 0
          ? `검토가 완료되었습니다. 관련 없는 작업 ${skippedTaskCount}건은 건너뛰었습니다.`
          : "검토가 완료되었습니다.",
      currentTaskLabel: null,
      error: null,
      updatedAt: timestamp,
      activityLogs: [
        ...current.activityLogs,
        {
          timestamp,
          status: "completed",
          message:
            skippedTaskCount > 0
              ? `선택 작업 중 ${ranTaskCount}건을 실행했고 ${skippedTaskCount}건은 관련 문구가 뚜렷하지 않아 건너뛰었습니다.`
              : "모든 선택 작업이 정상 완료되었습니다."
        }
      ]
    };
});
  } catch (error) {
    const logFileName = await persistFailureLog(job, error, currentTaskKey, currentTaskLabel);
    const detailParts = [
      error instanceof CodexExecError && error.summary ? error.summary : null,
      logFileName ? "실패 로그가 저장되었습니다. 아래 링크에서 확인하세요." : null
    ].filter((value): value is string => Boolean(value));

    updateJobRecord(jobId, (current) => {
      const timestamp = new Date().toISOString();
      return {
      ...current,
      status: "failed",
      progressMessage: "검토 작업이 실패했습니다.",
      currentTaskLabel,
      error: {
        code: "codex_execution_error",
        message:
          error instanceof CodexExecError
            ? "검토 엔진 실행이 실패했습니다."
            : error instanceof Error
              ? error.message
              : "알 수 없는 오류",
        details: detailParts.length > 0 ? detailParts.join("\n") : undefined,
        logFileName: logFileName ?? undefined
      },
      updatedAt: timestamp,
      activityLogs: [
        ...current.activityLogs,
        {
          timestamp,
          status: "failed",
          message:
            error instanceof CodexExecError
              ? "검토 엔진 실행 중 오류가 발생했습니다."
              : error instanceof Error
                ? error.message
                : "알 수 없는 오류가 발생했습니다."
        }
      ]
    };
});
  }
};
