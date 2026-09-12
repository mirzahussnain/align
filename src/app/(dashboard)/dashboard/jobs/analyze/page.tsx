import { redirect } from "next/navigation";

export default function AnalyseOwnJobPage() {
  redirect("/dashboard?tab=job_match");
}