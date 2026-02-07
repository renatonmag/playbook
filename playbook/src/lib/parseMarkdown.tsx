import remarkParse from "remark-parse";
import remarkBreaks from "remark-breaks";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export const parseMarkdown = async (content: string) => {
  const file = await unified()
    .use(remarkParse) // Parse markdown to mdast
    .use(remarkBreaks) // Transform markdown breaks to HTML breaks
    .use(remarkRehype) // Transform mdast to hast
    .use(rehypeStringify) // Transform hast to HTML string
    .process(content);

  return String(file);
};
