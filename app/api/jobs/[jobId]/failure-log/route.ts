import { NextResponse } from "next/server";

import { readTextArtifact } from "@/lib/jobs/fs";
import { getJobRecord } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

type FailureLogRouteProps = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: FailureLogRouteProps) {
  const { jobId } = await params;
  const job = getJobRecord(jobId);

  if (!job) {
    return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  const logFileName = job.error?.logFileName;
  if (!logFileName) {
    return NextResponse.json({ error: "저장된 실패 로그가 없습니다." }, { status: 404 });
  }

  try {
    const content = await readTextArtifact(job.tempDir, logFileName);

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${logFileName}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "실패 로그를 읽을 수 없습니다." }, { status: 500 });
  }
}
