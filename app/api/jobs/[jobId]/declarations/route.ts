import { NextResponse } from "next/server";

import { appendReviewFeedbacksToStore } from "@/lib/jobs/declarations";
import { getJobRecord, updateJobRecord } from "@/lib/jobs/store";
import type { ReviewChangeDeclaration } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

const submitterNameByIp: Record<string, string> = {
  "192.168.0.120": "서보경",
  "192.168.0.198": "김범기",
  "192.168.0.161": "최헌우",
  "192.168.0.156": "이형진",
  "192.168.0.27": "신태하",
  "192.168.0.129": "류경서",
  "192.168.0.14": "황진현"
};

const normalizeIpForSubmitter = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const first = value.split(",")[0].trim();
  if (!first) {
    return "";
  }

  return first.replace(/^::ffff:/i, "").trim();
};

const resolveSubmitterFromRequest = (request: Request) => {
  const candidateIp =
    normalizeIpForSubmitter(request.headers.get("x-forwarded-for")) ||
    normalizeIpForSubmitter(request.headers.get("x-real-ip")) ||
    normalizeIpForSubmitter(request.headers.get("x-client-ip")) ||
    "";

  const submitterIp = candidateIp;
  const submitterName = submitterIp ? submitterNameByIp[submitterIp] || "이름없음" : "이름없음";

  return { submitterIp, submitterName };
};

type DeclarationsRouteProps = {
  params: Promise<{ jobId: string }>;
};

type RequestPayload = {
  declarations?: ReviewChangeDeclaration[];
};

const isValidIssueType = (value: unknown): value is ReviewChangeDeclaration["issueType"] =>
  value === "error" || value === "risk" || value === "missing";

const isDeclaration = (value: unknown): value is ReviewChangeDeclaration => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const declaration = value as Partial<ReviewChangeDeclaration>;
  return (
    typeof declaration.itemId === "string" &&
    typeof declaration.taskKey === "string" &&
    typeof declaration.taskLabel === "string" &&
    typeof declaration.changeIndex === "number" &&
    isValidIssueType(declaration.issueType) &&
    typeof declaration.location === "string" &&
    typeof declaration.originalText === "string" &&
    typeof declaration.revisedText === "string" &&
    typeof declaration.declarationReason === "string" &&
    typeof declaration.declaredAt === "string"
  );
};

export async function POST(request: Request, { params }: DeclarationsRouteProps) {
  const { jobId } = await params;
  const job = getJobRecord(jobId);

  if (!job) {
    return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const declarations = Array.isArray(payload.declarations)
    ? payload.declarations.filter(isDeclaration)
    : [];
  const { submitterIp, submitterName } = resolveSubmitterFromRequest(request);
  const declarationsWithSubmitter = declarations.map((declaration) => ({
    ...declaration,
    submitterIp,
    submitterName
  }));

  const declaredIds = new Set(declarations.map((declaration) => declaration.itemId));
  const acceptedFeedbacks = job.results.flatMap((taskResult) =>
    (taskResult.review.changeItems ?? [])
      .map((item, index) => {
        const itemId = `${taskResult.taskKey}:${index}`;
        if (declaredIds.has(itemId)) {
          return null;
        }

        return {
          feedbackType: "accepted" as const,
          itemId,
          taskKey: taskResult.taskKey,
          taskLabel: taskResult.taskLabel,
          changeIndex: index,
          issueType: item.issueType ?? "error",
          location: item.location,
          originalText: item.originalText,
          revisedText: item.revisedText,
          note: "미조치 선언이 없어 조치 수용으로 간주됨",
          createdAt: new Date().toISOString()
        };
      })
      .filter(
        (
          value
        ): value is {
          feedbackType: "accepted";
          itemId: string;
          taskKey: ReviewChangeDeclaration["taskKey"];
          taskLabel: string;
          changeIndex: number;
          issueType: ReviewChangeDeclaration["issueType"];
          location: string;
          originalText: string;
          revisedText: string;
          note: string;
          createdAt: string;
        } => value !== null
      )
  );

  const saveResult = await appendReviewFeedbacksToStore([...declarationsWithSubmitter, ...acceptedFeedbacks]);

  updateJobRecord(jobId, (current) => {
    const timestamp = new Date().toISOString();
    return {
      ...current,
    declarations,
      updatedAt: timestamp,
      activityLogs: [
        ...current.activityLogs,
        {
          timestamp,
          status: current.status,
          message: `미조치 선언 ${saveResult.declaredAddedCount}건, 조치 수용 ${saveResult.acceptedAddedCount}건을 저장하고 이후 분석에 반영하도록 기록했습니다.`
        }
      ]
    };
  });

  return NextResponse.json({
    ok: true,
    declarationCount: declarations.length,
    acceptedCount: acceptedFeedbacks.length,
    addedCount: saveResult.addedCount,
    storePath: saveResult.storePath,
    summaryPath: saveResult.summaryPath
  });
}
