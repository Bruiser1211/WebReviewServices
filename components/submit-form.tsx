"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  codexModelOptions,
  defaultCodexModel,
  defaultReasoningEffort,
  reasoningEffortOptions,
  type CodexModel,
  type ReasoningEffort
} from "@/lib/codex/options";
import { taskOptions, type TaskKey } from "@/lib/tasks";

export function SubmitForm() {
  const router = useRouter();
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<TaskKey[]>([
    "officialDocumentReview"
  ]);
  const [selectedModel, setSelectedModel] = useState<CodexModel>(defaultCodexModel);
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<ReasoningEffort>(
    defaultReasoningEffort
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const toggleTask = (taskKey: TaskKey) => {
    setSelectedTaskKeys((current) =>
      current.includes(taskKey)
        ? current.filter((value) => value !== taskKey)
        : [...current, taskKey]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (selectedTaskKeys.length === 0) {
      setError("검토 작업을 한 개 이상 선택해야 합니다.");
      return;
    }

    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("taskKeys");

    for (const taskKey of selectedTaskKeys) {
      formData.append("taskKeys", taskKey);
    }

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { jobId: string } | { error: string };

      if (!response.ok || !("jobId" in payload)) {
        throw new Error("error" in payload ? payload.error : "작업 생성에 실패했습니다.");
      }

      router.push(`/jobs/${payload.jobId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "알 수 없는 오류");
      setIsSubmitting(false);
    }
  };

  return (
    <form className="panel submit-panel" onSubmit={handleSubmit}>
      <div className="config-grid">
        <div className="field-stack">
          <label className="field-label" htmlFor="model">
            모델
          </label>
          <select
            id="model"
            name="model"
            className="input select-input"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.currentTarget.value as CodexModel)}
          >
            {codexModelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="field-help">분량에 따라 변경 사용</p>
        </div>

        <div className="field-stack">
          <label className="field-label" htmlFor="reasoningEffort">
            이성 수준
          </label>
          <select
            id="reasoningEffort"
            name="reasoningEffort"
            className="input select-input"
            value={selectedReasoningEffort}
            onChange={(event) =>
              setSelectedReasoningEffort(event.currentTarget.value as ReasoningEffort)
            }
          >
            {reasoningEffortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="field-help">기본값은 매우 높음입니다.</p>
        </div>
      </div>

      <div className="field-stack">
        <span className="field-label">검토 작업</span>
        <div className="task-grid">
          {taskOptions.map((task) => {
            const checked = selectedTaskKeys.includes(task.key);

            return (
              <label
                key={task.key}
                className={`task-option${checked ? " task-option-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  name="taskKeys"
                  value={task.key}
                  checked={checked}
                  onChange={() => toggleTask(task.key)}
                />
                <div className="task-copy">
                  <strong>{task.label}</strong>
                  <span>{task.userGoal}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="field-stack">
        <label className="field-label" htmlFor="files">
          파일 업로드
        </label>
        <input
          id="files"
          name="files"
          className="input file-input"
          type="file"
          accept=".pdf,image/png,image/jpeg"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []).map((file) => file.name);
            setSelectedFiles(files);
          }}
        />
        <p className="field-help">PDF, JPG, PNG 파일을 업로드할 수 있습니다.</p>
      </div>

      {selectedFiles.length > 0 ? (
        <ul className="file-list">
          {selectedFiles.map((fileName) => (
            <li key={fileName}>{fileName}</li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "작업 생성 중..." : "검토 시작"}
      </button>
    </form>
  );
}
