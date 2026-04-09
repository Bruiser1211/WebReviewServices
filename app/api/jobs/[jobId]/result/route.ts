import { NextResponse } from "next/server";

import { getJobSnapshot } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

type JobResultRouteProps = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: JobResultRouteProps) {
  const { jobId } = await params;
  const job = getJobSnapshot(jobId);

  if (!job) {
    return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  if (job.results.length === 0) {
    return NextResponse.json({ error: "결과가 아직 준비되지 않았습니다." }, { status: 409 });
  }

  return NextResponse.json({ results: job.results });
}
