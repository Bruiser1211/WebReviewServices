import { NextResponse } from "next/server";

import { countJobs } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    activeJobs: countJobs(),
    timestamp: new Date().toISOString()
  });
}
