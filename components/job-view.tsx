"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCodexModelLabel, getReasoningEffortLabel } from "@/lib/codex/options";
import type {
  JobActivityLog,
  JobProgressEvent,
  JobSnapshot,
  ReviewChangeDeclaration,
  TaskReviewResult
} from "@/lib/jobs/types";

import { ResultSections } from "./result-sections";

type JobViewProps = {
  jobId: string;
};

const isErrorPayload = (payload: unknown): payload is { error: string } =>
  typeof payload === "object" &&
  payload !== null &&
  "error" in payload &&
  typeof (payload as { error?: unknown }).error === "string";

const statusLabels: Record<JobSnapshot["status"], string> = {
  queued: "대기 중",
  validating_upload: "업로드 검증 중",
  extracting_text: "문서 추출 중",
  running_review: "검토 실행 중",
  summarizing_result: "결과 정리 중",
  completed: "완료",
  failed: "실패",
  expired: "만료"
};

const statusTimeline = ["queued", "extracting_text", "running_review", "completed"] as const;

const appendUniqueLog = (logs: JobActivityLog[], next: JobActivityLog) => {
  if (
    logs.some(
      (log) =>
        log.timestamp === next.timestamp &&
        log.status === next.status &&
        log.message === next.message
    )
  ) {
    return logs;
  }

  return [...logs, next];
};

const clampNonNegative = (value: number) => (value < 0 ? 0 : value);

const formatRemainingTime = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainSeconds = rounded % 60;

  if (minutes <= 0) {
    return `약 ${remainSeconds}초`;
  }

  if (remainSeconds === 0) {
    return `약 ${minutes}분`;
  }

  return `약 ${minutes}분 ${remainSeconds}초`;
};

const estimateRemainingSeconds = (job: JobSnapshot, nowMs: number) => {
  const elapsedInCurrentStatus = clampNonNegative(
    (nowMs - new Date(job.updatedAt).getTime()) / 1000
  );
  const totalTasks = job.taskLabels.length;
  const finishedTasks = job.results.length;
  const remainingTasks = Math.max(totalTasks - finishedTasks, 0);

  if (job.status === "completed" || job.status === "failed" || job.status === "expired") {
    return null;
  }

  if (job.status === "queued" || job.status === "validating_upload") {
    return 10 + 25 + totalTasks * 90 + 10;
  }

  if (job.status === "extracting_text") {
    return clampNonNegative(25 - elapsedInCurrentStatus) + remainingTasks * 90 + 10;
  }

  if (job.status === "running_review") {
    const currentTaskRemain = clampNonNegative(90 - elapsedInCurrentStatus);
    const nextTasksRemain = Math.max(remainingTasks - 1, 0) * 90;
    return currentTaskRemain + nextTasksRemain + 10;
  }

  if (job.status === "summarizing_result") {
    return clampNonNegative(10 - elapsedInCurrentStatus);
  }

  return null;
};

const getTimelineIndex = (status: JobSnapshot["status"]) => {
  if (status === "completed") {
    return statusTimeline.length - 1;
  }

  switch (status) {
    case "queued":
    case "validating_upload":
      return 0;
    case "extracting_text":
      return 1;
    case "running_review":
    case "summarizing_result":
    case "failed":
      return 2;
    case "expired":
      return 0;
    default:
      return 0;
  }
};

export function JobView({ jobId }: JobViewProps) {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [results, setResults] = useState<TaskReviewResult[]>([]);
  const [activityLogs, setActivityLogs] = useState<JobActivityLog[]>([]);
  const [declarations, setDeclarations] = useState<ReviewChangeDeclaration[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSubmittingDeclarations, setIsSubmittingDeclarations] = useState(false);
  const [declarationMessage, setDeclarationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timelineLabels = useMemo(() => statusTimeline.map((step) => statusLabels[step]), []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadResults = async () => {
      const response = await fetch(`/api/jobs/${jobId}/result`, { cache: "no-store" });
      const payload = (await response.json()) as
        | { results: TaskReviewResult[] }
        | { error: string };

      if (!active) {
        return;
      }

      if (!response.ok || isErrorPayload(payload)) {
        setError(isErrorPayload(payload) ? payload.error : "최종 결과를 불러오지 못했습니다.");
        return;
      }

      setError(null);
      setResults(payload.results);
    };

    const fetchJob = async () => {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const payload = (await response.json()) as JobSnapshot | { error: string };

      if (!active) {
        return;
      }

      if (!response.ok || isErrorPayload(payload)) {
        setError(isErrorPayload(payload) ? payload.error : "작업 정보를 불러오지 못했습니다.");
        return;
      }

      setError(null);
      setJob(payload);
      setActivityLogs(payload.activityLogs ?? []);
      setDeclarations(payload.declarations ?? []);

      if (payload.results.length > 0) {
        setResults(payload.results);
        return;
      }

      if (payload.status === "completed") {
        await loadResults();
      }
    };

    void fetchJob();

    eventSource = new EventSource(`/api/jobs/${jobId}/events`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as JobProgressEvent;

      setJob((current) =>
        current
          ? {
              ...current,
              status: data.status,
              progressMessage: data.progressMessage,
              updatedAt: data.timestamp
            }
          : current
      );
      setActivityLogs((current) =>
        appendUniqueLog(current, {
          timestamp: data.timestamp,
          status: data.status,
          message: data.progressMessage
        })
      );

      if (
        data.resultAvailable ||
        data.status === "completed" ||
        data.status === "failed" ||
        data.status === "expired"
      ) {
        void fetchJob();
      }

      if (data.status === "failed" || data.status === "expired") {
        eventSource?.close();
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
    };

    return () => {
      active = false;
      eventSource?.close();
    };
  }, [jobId]);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!job) {
    return <p className="subtle-copy">작업 정보를 불러오는 중입니다.</p>;
  }

  const hasResults = results.length > 0;
  const currentIndex = getTimelineIndex(job.status);
  const displayStatusLabel = statusLabels[job.status];
  const progressText = job.currentTaskLabel
    ? `${job.currentTaskLabel} - ${job.progressMessage}`
    : job.progressMessage;
  const remainingSeconds = estimateRemainingSeconds(job, nowMs);
  const remainingText =
    remainingSeconds === null ? null : `예상 남은 시간: ${formatRemainingTime(remainingSeconds)}`;
  const declarationMap = declarations.reduce<Record<string, ReviewChangeDeclaration>>(
    (acc, declaration) => {
      acc[declaration.itemId] = declaration;
      return acc;
    },
    {}
  );

  const handleSaveDeclaration = (declaration: ReviewChangeDeclaration) => {
    setDeclarations((current) => {
      const filtered = current.filter((item) => item.itemId !== declaration.itemId);
      return [...filtered, declaration];
    });
    setDeclarationMessage(null);
  };

  const handleRemoveDeclaration = (itemId: string) => {
    setDeclarations((current) => current.filter((item) => item.itemId !== itemId));
    setDeclarationMessage(null);
  };

  const handleSubmitDeclarations = async () => {
    setIsSubmittingDeclarations(true);
    setDeclarationMessage(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/declarations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ declarations })
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        declarationCount?: number;
        acceptedCount?: number;
        summaryPath?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "미조치 선언 제출에 실패했습니다.");
      }

      setDeclarationMessage(
        `미조치 선언 ${payload.declarationCount ?? declarations.length}건, 조치 수용 ${payload.acceptedCount ?? 0}건이 저장되었고 이후 유사 사례 분석에 반영됩니다.${payload.summaryPath ? ` 저장 위치: ${payload.summaryPath}` : ""}`
      );
    } catch (submitError) {
      setDeclarationMessage(
        submitError instanceof Error ? submitError.message : "미조치 선언 제출에 실패했습니다."
      );
    } finally {
      setIsSubmittingDeclarations(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="panel status-panel">
        <div className="panel-header-row">
          <div className="status-heading">
            <h1>검토 진행 상황</h1>
            <Link className="ghost-button" href="/">
              메인화면
            </Link>
          </div>
          <span
            className={`status-pill status-${job.status}`}
          >
            {displayStatusLabel}
          </span>
        </div>
        <dl className="meta-grid">
          <div>
            <dt>생성 시각</dt>
            <dd>{new Date(job.createdAt).toLocaleString("ko-KR")}</dd>
          </div>
          <div>
            <dt>만료 시각</dt>
            <dd>{new Date(job.expiresAt).toLocaleString("ko-KR")}</dd>
          </div>
          <div>
            <dt>모델</dt>
            <dd>{getCodexModelLabel(job.model)}</dd>
          </div>
          <div>
            <dt>이성 수준</dt>
            <dd>{getReasoningEffortLabel(job.reasoningEffort)}</dd>
          </div>
          {/* Usage fields hidden for now; keep backend usage collection for future enablement. */}
        </dl>
        <div className="task-chip-list">
          {job.taskLabels.map((taskLabel) => (
            <span key={taskLabel} className="task-chip">
              {taskLabel}
            </span>
          ))}
        </div>
        <p className="progress-copy">{progressText}</p>
        {remainingText ? <p className="subtle-copy">{remainingText}</p> : null}
        <ol className="timeline" aria-label={timelineLabels.join(", ")}>
          {statusTimeline.map((step, stepIndex) => {
            const isDone = currentIndex >= stepIndex;
            return (
              <li key={step} className={isDone ? "timeline-done" : ""}>
                {statusLabels[step]}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <h2 className="panel-title">업로드 파일</h2>
        <ul className="file-list">
          {job.sourceFiles.map((file) => (
            <li key={file.storedName}>
              {file.name} · {Math.ceil(file.size / 1024)} KB
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel-title">작업 상세 로그</h2>
        {activityLogs.length === 0 ? (
          <p className="subtle-copy">아직 기록된 작업 로그가 없습니다.</p>
        ) : (
          <ol className="activity-log-list">
            {activityLogs.map((log, index) => (
              <li key={`${log.timestamp}-${log.status}-${index}`} className="activity-log-item">
                <p className="activity-log-meta">
                  {new Date(log.timestamp).toLocaleString("ko-KR")} · {statusLabels[log.status]}
                </p>
                <p className="activity-log-message">{log.message}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {job.error ? (
        <section className="panel failure-panel">
          <h2 className="panel-title">실패 정보</h2>
          <p>{job.error.message}</p>
          {job.error.details ? <p>{job.error.details}</p> : null}
          {job.error.logFileName ? (
            <a
              className="ghost-button"
              href={`/api/jobs/${jobId}/failure-log`}
              target="_blank"
              rel="noreferrer"
            >
              실패 로그 보기
            </a>
          ) : null}
        </section>
      ) : null}

      {hasResults ? (
        <section className="panel result-panel">
          <div className="panel-header-row">
            <h2 className="panel-title">검토 결과</h2>
            <a className="ghost-button" href={`/jobs/${jobId}/print`} target="_blank" rel="noreferrer">
              PDF 출력
            </a>
          </div>

          <div className="result-task-list">
            {results.map((taskResult) => (
              <ResultSections
                key={taskResult.taskKey}
                taskResult={taskResult}
                declarations={declarationMap}
                onSaveDeclaration={handleSaveDeclaration}
                onRemoveDeclaration={handleRemoveDeclaration}
              />
            ))}
          </div>
        </section>
      ) : null}

      {hasResults ? (
        <section className="panel">
          <div className="panel-header-row">
            <h2 className="panel-title">미조치 선언</h2>
            <button
              type="button"
              className="primary-button"
              disabled={isSubmittingDeclarations}
              onClick={handleSubmitDeclarations}
            >
              {isSubmittingDeclarations ? "제출 중..." : "미조치 선언 제출"}
            </button>
          </div>
          <p className="subtle-copy">
            토글을 켠 항목만 제출되며, 제출된 사유는 이후 유사 패턴 분석에 반영됩니다.
          </p>
          {declarationMessage ? <p className="subtle-copy">{declarationMessage}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
