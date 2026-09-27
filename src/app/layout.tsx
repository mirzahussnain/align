import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Align — Evidence-led UK career intelligence",
  description: "Build a reusable Career Profile, check ATS readiness, compare your evidence with UK roles, discover vacancies, and generate truthful tailored CVs.",
  keywords: "Align, career application intelligence, CV analysis, ATS analysis, UK jobs, Job Match, Career Profile, sponsorship evidence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/assets/svgs/logo.svg" type="image/svg+xml" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
