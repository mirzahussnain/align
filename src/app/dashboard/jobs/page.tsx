import { Suspense } from 'react';
import { DiscoverBoard } from '@/features/job-board/components/JobBoard';
export default function DiscoverJobsPage() { return <Suspense fallback={<div className="min-h-screen bg-bg-primary p-8 text-text-secondary">Loading Job Board…</div>}><DiscoverBoard /></Suspense>; }
