export async function extractTextFromPDF(file: File): Promise<{ text: string; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Dynamic import for pdf-parse (Node.js environment inside Next.js API Route)
  await import('pdf-parse/worker');
  const { PDFParse } = (await import('pdf-parse')) as any;
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const pdfData = await parser.getText();

  if (!pdfData || !pdfData.pages || pdfData.pages.length === 0) {
    throw new Error('No pages parsed from PDF');
  }

  const text = pdfData.pages.map((p: any) => p.text).join('\n');
  const pageCount = pdfData.total;

  await parser.destroy();

  return { text, pageCount };
}
