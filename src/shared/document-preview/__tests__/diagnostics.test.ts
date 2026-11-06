import { describe, expect, it } from 'vitest';
import {
  __setDocumentPipelineLogSink,
  logDocumentPipelineEvent,
} from '../diagnostics';

describe('document pipeline diagnostics', () => {
  it('drops fields outside the PII-safe diagnostics allow-list', () => {
    const records: Array<Record<string, unknown>> = [];
    const restore = __setDocumentPipelineLogSink((record) => records.push(record));
    try {
      logDocumentPipelineEvent('document_pipeline_stage_failed', {
        traceId: 'generation_safe',
        stage: 'pdf_open',
        category: 'dependency_missing',
        durationMs: 4,
        upstreamStatus: 200,
        credential: 'must-not-log',
        cvText: 'must-not-log',
        rawError: new Error('must-not-log'),
      });
    } finally {
      restore();
    }

    expect(records).toEqual([{
      evt: 'document_pipeline_stage_failed',
      severity: 'error',
      traceId: 'generation_safe',
      stage: 'pdf_open',
      category: 'dependency_missing',
      durationMs: 4,
      upstreamStatus: 200,
    }]);
  });
});
