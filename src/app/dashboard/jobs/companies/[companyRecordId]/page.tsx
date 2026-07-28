import { CompanyDetailsBoard } from '@/features/job-board/components/JobBoard';
export default async function CompanyDetailsPage({
  params,
}: {
  params: Promise<{ companyRecordId: string }>;
}) {
  const { companyRecordId } = await params;
  return <CompanyDetailsBoard companyRecordId={companyRecordId} />;
}
