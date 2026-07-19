import Footer from "@/shared/components/layout/Footer";
import LoaderProvider from "@/shared/components/providers/LoaderProvider";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LoaderProvider>
      <div className="flex-grow">{children}</div>
      <Footer />
    </LoaderProvider>
  );
}
