export interface TextBlock {
  id: string;
  content: string;
  type: "text";
  formatting?: TextFormatting;
}

export interface ListBlock {
  id: string;
  content: string;
  type: "ul" | "ol";
  level: number;
  formatting?: TextFormatting;
}

export type Block = TextBlock | ListBlock;

export interface TextFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSize?: number;
}

export interface Document {
  id: string;
  title: string;
  blocks: Block[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  blockCount: number;
}
