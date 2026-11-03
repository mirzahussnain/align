import { describe, expect, it } from 'vitest';
import {
  inspectPdf,
  MAX_PREVIEW_PDF_PAGES,
  renderPdfPages,
} from '../pdf-preview';

function minimalPdf(pageCount: number): Buffer {
  const pageObjectStart = 3;
  const contentObject = pageObjectStart + pageCount;
  const kids = Array.from(
    { length: pageCount },
    (_, index) => `${pageObjectStart + index} 0 R`,
  ).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents ${contentObject} 0 R >>`,
    ),
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let value = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  value += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value, 'ascii');
}

function pngDimensions(png: Buffer) {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe('PDF preview inspection and rasterisation', () => {
  it('reads the actual PDF page count', async () => {
    await expect(inspectPdf(minimalPdf(2))).resolves.toEqual({ pageCount: 2, finalPageOccupancy: 0 });
  });

  it('renders exactly one bounded PNG for each requested page', async () => {
    const pages = await renderPdfPages(minimalPdf(2), 2);
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const dimensions = pngDimensions(page);
      expect(dimensions.width).toBeGreaterThan(500);
      expect(dimensions.width).toBeLessThanOrEqual(1_200);
      expect(dimensions.height).toBeGreaterThan(dimensions.width);
      expect(dimensions.height).toBeLessThanOrEqual(1_704);
    }
  });

  it('rejects malformed bytes as unavailable page validation', async () => {
    await expect(inspectPdf(Buffer.from('not a PDF'))).rejects.toMatchObject({
      code: 'PAGE_VALIDATION_UNAVAILABLE',
    });
  });

  it('rejects page counts above the safe parser ceiling before raster fan-out', async () => {
    await expect(
      inspectPdf(minimalPdf(MAX_PREVIEW_PDF_PAGES + 1)),
    ).rejects.toMatchObject({ code: 'PAGE_VALIDATION_UNAVAILABLE' });
  });
});
