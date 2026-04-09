import { getJobSnapshot, subscribeToJob } from "@/lib/jobs/store";

import type { JobProgressEvent } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

type JobEventsRouteProps = {
  params: Promise<{ jobId: string }>;
};

const encoder = new TextEncoder();
const encodeEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

export async function GET(_: Request, { params }: JobEventsRouteProps) {
  const { jobId } = await params;
  const job = getJobSnapshot(jobId);

  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  let detach = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;

      detach = () => {
        if (!unsubscribe) {
          return;
        }

        unsubscribe();
        unsubscribe = null;
      };

      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;
        detach();

        try {
          controller.close();
        } catch {
          // The client may already have disconnected.
        }
      };

      const onEvent = (event: JobProgressEvent) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          closeStream();
          return;
        }

        if (
          event.status === "completed" ||
          event.status === "failed" ||
          event.status === "expired"
        ) {
          closeStream();
        }
      };

      unsubscribe = subscribeToJob(jobId, onEvent);

      if (closed) {
        detach();
      }
    },
    cancel() {
      detach();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
