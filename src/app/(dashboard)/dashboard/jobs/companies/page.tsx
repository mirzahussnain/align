import { Suspense } from "react";
import { CompaniesBoard } from "@/features/job-board/components/JobBoard";
export default function CompaniesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-primary p-8 text-text-secondary">
          Loading companies…
        </div>
      }
    >
      <CompaniesBoard />
    </Suspense>
  );
}
