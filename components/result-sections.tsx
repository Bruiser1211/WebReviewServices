"use client";

import { useState } from "react";

import type {
  ReviewChangeDeclaration,
  ReviewChangeItem,
  TaskReviewResult
} from "@/lib/jobs/types";

type ResultSectionsProps = {
  taskResult: TaskReviewResult;
  interactive?: boolean;
  declarations?: Record<string, ReviewChangeDeclaration>;
  onSaveDeclaration?: (declaration: ReviewChangeDeclaration) => void;
  onRemoveDeclaration?: (itemId: string) => void;
};

type ResultTone = "neutral" | "warning";

type ResultListProps = {
  title: string;
  itemTag: string;
  items: string[];
  tone: ResultTone;
  emptyMessage: string;
};

const renderCardList = (
  items: string[],
  tone: ResultTone,
  itemTag: string,
  emptyMessage: string
) => {
  if (items.length === 0) {
    return <p className="empty-copy">{emptyMessage}</p>;
  }

  return (
    <div className="result-item-list">
      {items.map((item, index) => (
        <article className={`result-item result-item-${tone}`} key={`${index}-${item.slice(0, 24)}`}>
          <span className="result-item-index">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <p>
              <strong>{itemTag} 항목 {String(index + 1).padStart(2, "0")}</strong>
            </p>
            <p>{item}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

function ResultList({
  title,
  itemTag,
  items,
  tone,
  emptyMessage
}: ResultListProps) {
  return (
    <section className="result-section">
      <div className="result-section-heading">
        <h3>{title}</h3>
      </div>
      {renderCardList(items, tone, itemTag, emptyMessage)}
    </section>
  );
}

function ChangeItemCard({ item, index }: { item: ReviewChangeItem; index: number }) {
  const issueType = item.issueType ?? "error";
  const issueLabel =
    issueType === "risk" ? "리스크" : issueType === "missing" ? "누락" : "오류";

  return (
    <article className="change-item">
      <div className="change-item-header">
        <span className="result-item-index">{String(index + 1).padStart(2, "0")}</span>
        <span className={`issue-tag issue-tag-${issueType}`}>{issueLabel}</span>
        <p className="change-item-location">{item.location}</p>
      </div>
      <section className="change-item-block">
        <h4>원문</h4>
        <p>{item.originalText}</p>
      </section>
      <section className="change-item-block change-item-block-accent">
        <h4>수정안</h4>
        <p>{item.revisedText}</p>
      </section>
      <section className="change-item-reason">
        <h4>사유</h4>
        <p>{item.reason}</p>
      </section>
    </article>
  );
}

type InteractiveChangeItemCardProps = {
  taskResult: TaskReviewResult;
  item: ReviewChangeItem;
  index: number;
  interactive: boolean;
  declaration?: ReviewChangeDeclaration;
  onSaveDeclaration?: (declaration: ReviewChangeDeclaration) => void;
  onRemoveDeclaration?: (itemId: string) => void;
};

function InteractiveChangeItemCard({
  taskResult,
  item,
  index,
  interactive,
  declaration,
  onSaveDeclaration,
  onRemoveDeclaration
}: InteractiveChangeItemCardProps) {
  const issueType = item.issueType ?? "error";
  const issueLabel =
    issueType === "risk" ? "리스크" : issueType === "missing" ? "누락" : "오류";
  const itemId = `${taskResult.taskKey}:${index}`;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftReason, setDraftReason] = useState(declaration?.declarationReason ?? "");

  const handleToggle = () => {
    if (!interactive) {
      return;
    }

    if (declaration) {
      onRemoveDeclaration?.(itemId);
      return;
    }

    setIsModalOpen(true);
  };

  const handleSave = () => {
    const trimmedReason = draftReason.trim();
    if (!trimmedReason) {
      return;
    }

    onSaveDeclaration?.({
      itemId,
      taskKey: taskResult.taskKey,
      taskLabel: taskResult.taskLabel,
      changeIndex: index,
      issueType,
      location: item.location,
      originalText: item.originalText,
      revisedText: item.revisedText,
      declarationReason: trimmedReason,
      declaredAt: new Date().toISOString()
    });
    setIsModalOpen(false);
  };

  return (
    <>
      <article className="change-item">
        <div className="change-item-header">
          <span className="result-item-index">{String(index + 1).padStart(2, "0")}</span>
          <span className={`issue-tag issue-tag-${issueType}`}>{issueLabel}</span>
          <p className="change-item-location">{item.location}</p>
          {interactive ? (
            <button
              type="button"
              className={`ghost-button declaration-toggle${declaration ? " declaration-toggle-active" : ""}`}
              onClick={handleToggle}
            >
              {declaration ? "미조치 선언 해제" : "미조치 선언"}
            </button>
          ) : null}
        </div>
        <section className="change-item-block">
          <h4>원문</h4>
          <p>{item.originalText}</p>
        </section>
        <section className="change-item-block change-item-block-accent">
          <h4>수정안</h4>
          <p>{item.revisedText}</p>
        </section>
        <section className="change-item-reason">
          <h4>사유</h4>
          <p>{item.reason}</p>
        </section>
        {declaration ? (
          <section className="change-item-reason declaration-reason">
            <h4>미조치 사유</h4>
            <p>{declaration.declarationReason}</p>
          </section>
        ) : null}
      </article>

      {isModalOpen ? (
        <div className="declaration-inline-panel" role="dialog" aria-modal="false" aria-label="미조치 선언 사유 입력">
          <h3>미조치 선언 사유</h3>
          <p className="subtle-copy">현재 수정 항목을 반영하지 않는 이유를 기록합니다.</p>
          <textarea
            className="input declaration-textarea"
            value={draftReason}
            onChange={(event) => setDraftReason(event.currentTarget.value)}
            placeholder="예: 기관 관행상 현재 표기가 허용되며 수정 필요성이 낮음"
          />
          <div className="declaration-modal-actions">
            <button type="button" className="ghost-button" onClick={() => setIsModalOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={!draftReason.trim()}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ResultSections({
  taskResult,
  interactive = true,
  declarations = {},
  onSaveDeclaration,
  onRemoveDeclaration
}: ResultSectionsProps) {
  const { review } = taskResult;
  const changeItems = review.changeItems ?? [];

  return (
    <section className="result-task">
      <header className="result-task-header">
        <p className="eyebrow">검토 작업</p>
        <h2>{taskResult.taskLabel}</h2>
        {/* Usage summary hidden for now; keep task usage payload for later use. */}
      </header>

      <div className="result-summary-grid">
        <section className="result-highlight">
          <h3>요약</h3>
          <p className="subtle-copy">문서 전체 내용을 짧게 정리한 항목입니다.</p>
          <p>{review.summary}</p>
        </section>
        <section className="result-highlight result-highlight-strong">
          <h3>판정</h3>
          <p className="subtle-copy">최종 결론 또는 현재 조치 판단을 나타냅니다.</p>
          <p>{review.decision}</p>
        </section>
      </div>

      <section className="result-section">
        <div className="result-section-heading">
          <h3>수정 항목</h3>
          <p>각 수정사항을 원문, 수정안, 사유 기준으로 1건씩 확인하세요.</p>
        </div>
        {changeItems.length === 0 ? (
          <p className="empty-copy">정리된 수정 항목이 없습니다.</p>
        ) : (
          <div className="change-item-list">
            {changeItems.map((item, index) => (
              <InteractiveChangeItemCard
                key={`${index}-${item.location}-${item.originalText.slice(0, 12)}`}
                taskResult={taskResult}
                item={item}
                index={index}
                interactive={interactive}
                declaration={declarations[`${taskResult.taskKey}:${index}`]}
                onSaveDeclaration={onSaveDeclaration}
                onRemoveDeclaration={onRemoveDeclaration}
              />
            ))}
          </div>
        )}
      </section>

      <ResultList
        title="핵심 근거"
        itemTag="핵심 근거"
        items={review.evidence}
        tone="neutral"
        emptyMessage="정리된 핵심 근거가 없습니다."
      />

      <ResultList
        title="추가할 사항"
        itemTag="추가할 사항"
        items={review.missingItems}
        tone="neutral"
        emptyMessage="추가로 준비할 사항이 없습니다."
      />

      <ResultList
        title="유의 리스크"
        itemTag="유의 리스크"
        items={review.risks}
        tone="warning"
        emptyMessage="현재 확인된 리스크가 없습니다."
      />
    </section>
  );
}
