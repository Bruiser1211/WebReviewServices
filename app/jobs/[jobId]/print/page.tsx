import { notFound } from "next/navigation";

import { ResultSections } from "@/components/result-sections";
import { getCodexModelLabel, getReasoningEffortLabel } from "@/lib/codex/options";
import { getJobSnapshot } from "@/lib/jobs/store";

import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

type PrintPageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function PrintPage({ params }: PrintPageProps) {
  const { jobId } = await params;
  const job = getJobSnapshot(jobId);

  if (!job || job.results.length === 0) {
    notFound();
  }

  return (
    <main className="print-shell">
      <div className="print-toolbar-wrap">
        <PrintTrigger />
      </div>
      <article className="print-document">
        <header className="print-header">
          <h1>문서 검토 결과</h1>
          <p>
            생성 시각: {new Date(job.updatedAt).toLocaleString("ko-KR")} · 작업 ID: {job.jobId}
          </p>
          <p>
            모델: {getCodexModelLabel(job.model)} · 이성 수준:{" "}
            {getReasoningEffortLabel(job.reasoningEffort)}
          </p>
          {/* Usage block intentionally hidden for now. */}
        </header>
        <div className="result-task-list">
          {job.results.map((taskResult) => (
            <ResultSections key={taskResult.taskKey} taskResult={taskResult} interactive={false} />
          ))}
        </div>
      </article>
    </main>
  );
}
