/** Provider-neutral document facts retained only for the lifetime of extraction. */
export type NormalizedDocumentKind =
  | 'heading'
  | 'paragraph'
  | 'bullet'
  | 'table-cell'
  | 'link'
  | 'unknown';

export interface NormalizedDocumentBlock {
  id: string;
  order: number;
  text: string;
  kind: NormalizedDocumentKind;
  page?: number;
  /** Provider-reported writing direction; never inferred. */
  direction?: string;
  parentId?: string;
  list?: { level: number; ordered: boolean };
  table?: { table: number; row: number; column: number };
  layout?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    column?: number;
  };
  style?: {
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    /** Provider-reported font family; never used as semantic vocabulary. */
    fontFamily?: string;
    headingLevel?: number;
  };
  links?: string[];
  /** Optional provider label for a block-local link; retained for compatibility projection. */
  linkDetails?: { url: string; visibleText?: string }[];
}

export interface NormalizedDocument {
  sourceType: 'pdf' | 'docx';
  blocks: NormalizedDocumentBlock[];
  pageCount: number | null;
}
