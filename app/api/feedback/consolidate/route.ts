import { NextResponse } from "next/server";

import { consolidateReviewFeedbacks } from "@/lib/jobs/declarations";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await consolidateReviewFeedbacks();
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조치/미조치 데이터 정리에 실패했습니다.";
    const status = message.includes("데이터가 없습니다") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
