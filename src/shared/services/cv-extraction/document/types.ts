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
    headingLevel?: number;
  };
  links?: string[];
}

export interface NormalizedDocument {
  sourceType: 'pdf' | 'docx';
  blocks: NormalizedDocumentBlock[];
  pageCount: number | null;
}
