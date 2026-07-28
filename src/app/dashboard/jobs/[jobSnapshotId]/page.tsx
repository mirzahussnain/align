import { JobDetailsBoard } from '@/features/job-board/components/JobBoard';

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ jobSnapshotId: string }>;
}) {
  const { jobSnapshotId } = await params;
  return <JobDetailsBoard jobSnapshotId={jobSnapshotId} />;
}
