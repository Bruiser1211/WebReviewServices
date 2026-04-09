import { JobView } from "@/components/job-view";

export const dynamic = "force-dynamic";

type JobPageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobPage({ params }: JobPageProps) {
  const { jobId } = await params;

  return (
    <main className="shell shell-wide">
      <JobView jobId={jobId} />
    </main>
  );
}
