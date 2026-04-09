"use client";

export function PrintTrigger() {
  return (
    <button className="ghost-button print-toolbar" type="button" onClick={() => window.print()}>
      인쇄 / PDF 저장
    </button>
  );
}
