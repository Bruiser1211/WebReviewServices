import { NextResponse } from "next/server";

import { createJobFromFormData } from "@/lib/jobs/service";
import { getJobSnapshot } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const job = await createJobFromFormData(formData);
    const snapshot = getJobSnapshot(job.jobId);

    return NextResponse.json(
      {
        jobId: job.jobId,
        status: snapshot?.status ?? job.status,
        url: `/jobs/${job.jobId}`
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "작업 생성에 실패했습니다."
      },
      { status: 400 }
    );
  }
}
