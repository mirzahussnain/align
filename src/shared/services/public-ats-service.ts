import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { CVAnalysisResult } from '@/shared/types/cv';
import { prisma } from '@/shared/lib/prisma';
import { ANALYSIS_LIMITS, ANALYSIS_VERSIONS, RETENTION } from '@/shared/config/analysis-domain';
import { analyzeCV, fallbackContext } from '@/shared/utils/scoring-engine';
import { extractStoredCv, validateUploadBytes, CvPipelineError } from './cv-extraction';
import { APIError } from '@/shared/utils/api-error';

export const PUBLIC_ATS_COOKIE = 'align_public_ats';
const IP_ALLOWANCE = 3;

export interface PublicAtsPreview {
  viewerMode: 'anonymous_demo';
  overallScore: number;
  categories: Array<{ id: string; label: string; score: number; maxScore: number; status: string }>;
  strengths: string[];
  weaknesses: string[];
}

export function projectPublicAtsPreview(result: CVAnalysisResult): PublicAtsPreview {
  const ranked = [...result.categories].sort((a, b) => (b.score / b.maxScore) - (a.score / a.maxScore));
  return {
    viewerMode: 'anonymous_demo',
    overallScore: result.overallScore,
    categories: result.categories.slice(0, 4).map(({ id, label, score, maxScore, status }) => ({ id, label, score, maxScore, status })),
    strengths: ranked.slice(0, 3).map((item) => `${item.label}: ${item.score}/${item.maxScore}`),
    weaknesses: result.recommendations.slice(0, 2).map((item) => item.title),
  };
}

const secret = () => process.env.BETTER_AUTH_SECRET ?? 'local-public-ats-demo';
const opaqueHash = (value: string) => createHmac('sha256', secret()).update(value).digest('hex');
const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function publicAtsClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip')
    ?? headers.get('x-real-ip')
    ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

export function publicAtsIdentifier(ip: string): string {
  return opaqueHash(`ip:${ip}`);
}

export async function createPublicAtsDemo(args: {
  file: File;
  existingToken?: string;
  ip: string;
}): Promise<{ token: string; result: CVAnalysisResult; expiresAt: Date }> {
  if (args.existingToken) {
    const existing = await prisma.anonymousAtsResult.findUnique({
      where: { sessionHash: opaqueHash(`session:${args.existingToken}`) },
      select: { id: true },
    });
    if (existing) throw new APIError('This browser has already used its free ATS demo.', 429);
  }
  if (args.file.size > ANALYSIS_LIMITS.maxDirectMultipartCvBytes) throw new APIError('File too large.', 413);
  const ipHash = publicAtsIdentifier(args.ip);
  const cutoff = new Date(Date.now() - RETENTION.anonymousDemoHours * 3_600_000);
  const recentForIp = await prisma.anonymousAtsResult.count({
    where: { ipHash, createdAt: { gte: cutoff } },
  });
  if (recentForIp >= IP_ALLOWANCE) {
    throw new APIError('The free ATS demo limit has been reached for this network.', 429);
  }

  const bytes = Buffer.from(await args.file.arrayBuffer());
  try {
    const validated = validateUploadBytes(args.file.name, bytes);
    const extracted = await extractStoredCv(validated.bytes);
    if (extracted.text.length > ANALYSIS_LIMITS.maxCvCharacters) {
      throw new APIError('The extracted CV text is too long to analyse safely.', 413);
    }
    const token = randomBytes(32).toString('base64url');
    const context = fallbackContext();
    const result = analyzeCV(extracted.text, extracted.pageCount ?? 1, context);
    result.fileName = args.file.name || 'CV.pdf';
    result.mode = 'ats';
    result.aiApplied = false;
    result.aiSkipped = 'quota';
    const expiresAt = new Date(Date.now() + RETENTION.anonymousDemoHours * 3_600_000);

    await prisma.anonymousAtsResult.create({
      data: {
        tokenHash: opaqueHash(`token:${token}`),
        sessionHash: opaqueHash(`session:${token}`),
        ipHash,
        status: 'READY',
        filename: result.fileName,
        mimeType: validated.mimeType,
        byteSize: validated.sizeBytes,
        checksum: checksum(validated.bytes),
        extractedText: extracted.text,
        pageCount: extracted.pageCount,
        resultJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        overallScore: result.overallScore,
        expiresAt,
      },
    });
    return { token, result, expiresAt };
  } catch (error) {
    if (error instanceof APIError) throw error;
    if (error instanceof CvPipelineError) throw new APIError(error.message, error.status);
    throw error;
  }
}

export async function getPublicAtsDemo(token: string): Promise<{
  result: CVAnalysisResult;
  expiresAt: Date;
}> {
  const row = await prisma.anonymousAtsResult.findUnique({
    where: { tokenHash: opaqueHash(`token:${token}`) },
  });
  if (!row || row.status !== 'READY' || row.expiresAt <= new Date() || !row.resultJson) {
    throw new APIError('This ATS demo is unavailable or has expired.', 404);
  }
  return { result: row.resultJson as unknown as CVAnalysisResult, expiresAt: row.expiresAt };
}

export async function claimPublicAtsDemo(args: {
  userId: string;
  token: string;
}): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.anonymousAtsResult.findUnique({
      where: { tokenHash: opaqueHash(`token:${args.token}`) },
    });
    if (!row || row.status !== 'READY' || row.expiresAt <= new Date() || !row.resultJson || row.overallScore == null) {
      throw new APIError('This ATS demo is unavailable, expired, or already claimed.', 409);
    }
    const claimed = await tx.anonymousAtsResult.updateMany({
      where: { id: row.id, status: 'READY', claimedAt: null },
      data: { status: 'CLAIMED', claimedAt: new Date(), claimedByUserId: args.userId },
    });
    if (claimed.count !== 1) throw new APIError('This ATS demo has already been claimed.', 409);

    const revision = await tx.cvRevision.create({
      data: {
        userId: args.userId,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        checksum: row.checksum,
        extractedText: row.extractedText,
        pageCount: row.pageCount,
        parserVersion: ANALYSIS_VERSIONS.cvParser,
        sourceObjectDeletedAt: new Date(),
      },
    });
    const result = row.resultJson as unknown as CVAnalysisResult;
    const analysis = await tx.atsAnalysis.create({
      data: {
        userId: args.userId,
        cvRevisionId: revision.id,
        overallScore: row.overallScore,
        resultJson: row.resultJson as Prisma.InputJsonValue,
        scoringVersion: String(result.scoringVersion ?? 2),
        profileVersion: result.profileVersion ?? null,
        dictionaryVersion: result.dictionaryVersion ?? null,
        occupation: result.classification?.occupation ?? null,
        applicationWorkflow: result.classification?.applicationWorkflow ?? null,
        classification: result.classification
          ? JSON.parse(JSON.stringify(result.classification)) as Prisma.InputJsonValue
          : undefined,
        aiEnhanced: false,
      },
    });
    return analysis.id;
  }, { isolationLevel: 'Serializable' });
}
