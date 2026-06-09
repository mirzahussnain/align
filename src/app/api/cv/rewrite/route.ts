import { NextResponse } from 'next/server';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { generateArchitectTemplate } from '@/shared/templates/template1_architect';
import { generateEditorialTemplate } from '@/shared/templates/template2_editorial';
import { generateTechnicalTemplate } from '@/shared/templates/template3_technical';
import { generateAcademicTemplate } from '@/shared/templates/template4_academic';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { RewriteRequestSchema } from './schema';

export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const body = await request.json();
    
    const parsed = RewriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { cvText, jobDescription, jobMatchFeedback, templateId, hitlContext, atsOptimizationData } = parsed.data;

    console.log('Initiating AI CV Rewrite...');
    
    // 1. Rewrite the CV into strict JSON using AI
    const rewrittenData = await rewriteCV(cvText, jobDescription, jobMatchFeedback || '', templateId || 'architect', hitlContext || {}, atsOptimizationData);
    
    if (!rewrittenData) {
      throw new APIError('Failed to generate CV content from AI', 500);
    }

    // 2. Generate the DOCX Buffer based on the selected template
    let docxBuffer: Buffer;
    if (templateId === 'editorial_refined') {
      docxBuffer = await generateEditorialTemplate(rewrittenData);
    } else if (templateId === 'technical_precision') {
      docxBuffer = await generateTechnicalTemplate(rewrittenData);
    } else if (templateId === 'academic_latex') {
      docxBuffer = await generateAcademicTemplate(rewrittenData);
    } else if (templateId === 'architect' || !templateId) {
      docxBuffer = await generateArchitectTemplate(rewrittenData);
    } else {
      throw new APIError('Unknown template ID', 400);
    }

    // 3. Return the Buffer as a downloadable file stream
    return new NextResponse(docxBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Tailored_CV.docx"',
      },
    });
  });
}
