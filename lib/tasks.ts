export type TaskKey =
  | "officialDocumentReview"
  | "contractClauseReview"
  | "contractExpenditureCheck"
  | "expenditureGuide";

export type TaskDefinition = {
  key: TaskKey;
  label: string;
  skillName: string;
  userGoal: string;
  outputFocus: string[];
};

export const taskDefinitions: Record<TaskKey, TaskDefinition> = {
  officialDocumentReview: {
    key: "officialDocumentReview",
    label: "공문 검토",
    skillName: "official-document-drafting",
    userGoal: "공문, 기안문, 시행문, 내부결재 문안을 검토하거나 다듬습니다.",
    outputFocus: ["문서 요약", "문안의 문제점", "필수 보완 사항", "표현 개선안"]
  },
  contractClauseReview: {
    key: "contractClauseReview",
    label: "계약 조항 검토",
    skillName: "contract-clause-review",
    userGoal: "계약 조항의 누락, 충돌, 위험 문구, 불명확한 표현을 검토합니다.",
    outputFocus: ["조항 진단", "문제 조항 근거", "누락 또는 충돌", "권장 수정 방향"]
  },
  contractExpenditureCheck: {
    key: "contractExpenditureCheck",
    label: "계약/지출 기준 판정",
    skillName: "contract-expenditure-drafting",
    userGoal: "내부 기준에 비춰 계약 또는 지출 집행 가능 여부를 판정합니다.",
    outputFocus: ["판정 결과", "기준상 누락 사항", "조건부 필요 항목", "집행 리스크"]
  },
  expenditureGuide: {
    key: "expenditureGuide",
    label: "지출결의 안내",
    skillName: "expenditure-resolution-guide",
    userGoal: "지출결의 처리 흐름과 필요한 입력 값 및 확인사항을 안내합니다.",
    outputFocus: ["현재 상황 요약", "다음 단계", "필수 확인 항목", "주의 리스크"]
  }
};

export const taskOptions = Object.values(taskDefinitions);

export const getTaskDefinition = (taskKey: string): TaskDefinition | null => {
  if (taskKey in taskDefinitions) {
    return taskDefinitions[taskKey as TaskKey];
  }

  return null;
};

export const getTaskDefinitions = (taskKeys: string[]) => {
  const uniqueKeys = Array.from(new Set(taskKeys));

  return uniqueKeys
    .map((taskKey) => getTaskDefinition(taskKey))
    .filter((task): task is TaskDefinition => task !== null);
};
