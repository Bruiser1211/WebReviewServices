import { NextResponse } from "next/server";

import { removeJob } from "@/lib/jobs/service";
import { getJobSnapshot } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

type JobRouteProps = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: JobRouteProps) {
  const { jobId } = await params;
  const job = getJobSnapshot(jobId);

  if (!job) {
    return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function DELETE(_: Request, { params }: JobRouteProps) {
  const { jobId } = await params;
  const removed = await removeJob(jobId);

  if (!removed) {
    return NextResponse.json({ error: "삭제할 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
