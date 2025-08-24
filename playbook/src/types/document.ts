export interface TextBlock {
  id: string;
  content: string;
  type: "text";
  formatting?: TextFormatting;
  images?: Image[];
}

export interface ListBlock {
  id: string;
  content: string;
  type: "ul" | "ol";
  level: number;
  formatting?: TextFormatting;
  images?: Image[];
}

export interface RadioBlock {
  id: string;
  content: string;
  type: "radio";
  formatting?: TextFormatting;
  images?: Image[];
}

export interface CheckboxBlock {
  id: string;
  content: string;
  type: "checkbox";
  formatting?: TextFormatting;
  images?: Image[];
}

export type Block = TextBlock | ListBlock | RadioBlock | CheckboxBlock;

export interface Image {
  id: string;
  filename: string;
  size: number;
  type: string;
  url: string; // Object URL for displaying the image
}

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
