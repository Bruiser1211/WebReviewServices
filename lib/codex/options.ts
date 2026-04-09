export const codexModelOptions = [
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" }
] as const;

export type CodexModel = (typeof codexModelOptions)[number]["value"];

export const reasoningEffortOptions = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "중간" },
  { value: "high", label: "높음" },
  { value: "xhigh", label: "매우 높음" }
] as const;

export type ReasoningEffort = (typeof reasoningEffortOptions)[number]["value"];

export const defaultCodexModel: CodexModel = "gpt-5.4-mini";
export const defaultReasoningEffort: ReasoningEffort = "xhigh";

const codexModelSet = new Set<string>(codexModelOptions.map((option) => option.value));
const reasoningEffortSet = new Set<string>(reasoningEffortOptions.map((option) => option.value));

export const parseCodexModel = (value: string | null | undefined): CodexModel => {
  if (!value) {
    return defaultCodexModel;
  }

  if (codexModelSet.has(value)) {
    return value as CodexModel;
  }

  throw new Error("지원하지 않는 Codex 모델입니다.");
};

export const parseReasoningEffort = (value: string | null | undefined): ReasoningEffort => {
  if (!value) {
    return defaultReasoningEffort;
  }

  if (reasoningEffortSet.has(value)) {
    return value as ReasoningEffort;
  }

  throw new Error("지원하지 않는 추론 수준입니다.");
};

export const getCodexModelLabel = (value: CodexModel) =>
  codexModelOptions.find((option) => option.value === value)?.label ?? value;

export const getReasoningEffortLabel = (value: ReasoningEffort) =>
  reasoningEffortOptions.find((option) => option.value === value)?.label ?? value;
