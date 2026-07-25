import { describe, expect, it } from 'vitest';
import { CLOSED_EDITOR, editorMatchesType, evidenceFormFieldId, evidenceRecordKey, STRUCTURED_EVIDENCE_EDITOR_KINDS, type EvidenceEditorState } from '../StructuredEvidenceManager';

describe('StructuredEvidenceManager editor isolation', () => {
  it('keeps all seven structured evidence sections independent', () => {
    expect(STRUCTURED_EVIDENCE_EDITOR_KINDS).toEqual(['certification', 'training', 'licence', 'registration', 'language', 'volunteering', 'other']);
  });

  it('opens an editor only for its matching evidence type', () => {
    const languageDraft: EvidenceEditorState = { mode: 'create', evidenceType: 'language', draftId: 'draft-language', draft: { language: '' } };
    expect(editorMatchesType(languageDraft, 'language')).toBe(true);
    expect(editorMatchesType(languageDraft, 'certification')).toBe(false);
    expect(editorMatchesType(CLOSED_EDITOR, 'language')).toBe(false);
  });

  it('uses type-and-id-specific record keys and field ids', () => {
    expect(evidenceRecordKey('language', 'record-1')).toBe('language:record-1');
    expect(evidenceRecordKey('certification', 'record-1')).toBe('certification:record-1');
    expect(evidenceFormFieldId('language', 'draft-1', 'language')).toBe('language-draft-1-language');
    expect(evidenceFormFieldId('certification', 'record-1', 'officialName')).not.toBe(evidenceFormFieldId('language', 'record-1', 'officialName'));
  });
});
