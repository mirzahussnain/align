import 'server-only';

export type DocumentPipelineEvent =
  | 'document_pipeline_stage_completed'
  | 'document_pipeline_stage_failed';

export interface SafeDocumentPipelineMeta {
  traceId?: string;
  stage?: string;
  category?: string;
  durationMs?: number;
  upstreamStatus?: number;
  retryable?: boolean;
}

const ALLOWED_KEYS: ReadonlyArray<keyof SafeDocumentPipelineMeta> = [
  'traceId',
  'stage',
  'category',
  'durationMs',
  'upstreamStatus',
  'retryable',
];

export type DocumentPipelineLogSink = (record: Record<string, unknown>) => void;

const defaultSink: DocumentPipelineLogSink = (record) => {
  const level = record.severity === 'error' ? 'error' : 'info';
  console[level](`[document-pipeline] ${JSON.stringify(record)}`);
};

let sink: DocumentPipelineLogSink = defaultSink;

export function __setDocumentPipelineLogSink(next: DocumentPipelineLogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export function logDocumentPipelineEvent(
  event: DocumentPipelineEvent,
  meta: SafeDocumentPipelineMeta & Record<string, unknown>,
): void {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = meta[key];
    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      safe[key] = value;
    }
  }
  sink({
    evt: event,
    severity: event === 'document_pipeline_stage_failed' ? 'error' : 'info',
    ...safe,
  });
}
