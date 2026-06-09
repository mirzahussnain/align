import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/shared/components/layout/Footer";

export const metadata: Metadata = {
  title: "Align — UK Tech Career Intelligence",
  description: "Analyze your CV against UK tech market standards. Get ATS scores, keyword analysis, section ordering recommendations, and discover UK tech jobs with visa sponsorship intelligence.",
  keywords: "Align, CV analyzer, ATS score, UK tech jobs, visa sponsorship, career intelligence",
};

import LoaderProvider from "@/shared/components/providers/LoaderProvider";

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
      <body className="antialiased">
        <LoaderProvider>
          <div className="flex-grow">
            {children}
          </div>
          <Footer />
        </LoaderProvider>
      </body>
    </html>
  );
}
