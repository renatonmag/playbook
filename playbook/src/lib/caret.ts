export interface CaretPosition {
  line: number;
  column: number;
}

export interface VisualLineRect {
  top: number;
  left: number;
  right: number;
  height: number;
}

/**
 * Cross-browser helper to get a collapsed caret Range from a point.
 */
export function getCaretRangeFromPoint(
  doc: Document,
  x: number,
  y: number
): Range | null {
  const anyDoc = doc as any;
  if (typeof anyDoc.caretRangeFromPoint === "function") {
    const r: Range | null = anyDoc.caretRangeFromPoint(x, y);
    return r;
  }
  if (typeof anyDoc.caretPositionFromPoint === "function") {
    const pos = anyDoc.caretPositionFromPoint(x, y);
    if (pos) {
      const r = doc.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.setEnd(pos.offsetNode, pos.offset);
      return r;
    }
  }
  return null;
}

/**
 * Compute soft-wrap-aware visual line rectangles for an editable element.
 */
export function getVisualLineRects(editable: HTMLElement): VisualLineRect[] {
  const doc = editable.ownerDocument || document;
  const range = doc.createRange();
  range.selectNodeContents(editable);
  const rectList = range.getClientRects();
  const lines: VisualLineRect[] = [];
  for (let i = 0; i < rectList.length; i++) {
    const r = rectList[i];
    const top = Math.round(r.top);
    const existing = lines.find((lr) => lr.top === top);
    if (existing) {
      existing.left = Math.min(existing.left, r.left);
      existing.right = Math.max(existing.right, r.right);
      existing.height = Math.max(existing.height, r.height);
    } else {
      lines.push({ top, left: r.left, right: r.right, height: r.height });
    }
  }
  lines.sort((a, b) => a.top - b.top);
  return lines;
}

/**
 * Compute caret position relative to the provided editable element.
 *
 * Baseline behavior (2.1): uses hard line breaks ("\n") only.
 * Soft-wrap handling will be added in 2.2 via client rect grouping.
 */
// export function getCaretPositionFromSelection(
//   editable: HTMLElement
// ): CaretPosition {
//   try {
//     const selection = window.getSelection();
//     if (!selection || selection.rangeCount === 0) {
//       return { line: 0, column: 0 };
//     }

//     const range = selection.getRangeAt(0);

//     // Ensure the selection end is within the editable element
//     if (!editable.contains(range.endContainer)) {
//       return { line: 0, column: 0 };
//     }

//     const preCaretRange = range.cloneRange();
//     preCaretRange.selectNodeContents(editable);
//     preCaretRange.setEnd(range.endContainer, range.endOffset);

//     // Determine visual line index using client rects (soft-wrap aware)
//     const rects = preCaretRange.getClientRects();
//     if (!rects || rects.length === 0) {
//       return { line: 0, column: 0 };
//     }

//     // Group by unique top values (rounded) to identify visual rows
//     const tops: number[] = [];
//     for (let i = 0; i < rects.length; i++) {
//       const top = Math.round(rects[i].top);
//       if (!tops.includes(top)) tops.push(top);
//     }
//     const visualLineIndex = Math.max(0, tops.length - 1);

//     const caretAbsoluteIndex = preCaretRange.toString().length;
//     const text = editable.innerText || "";
//     if (text.length === 0) {
//       // Empty or image-only content: default to start
//       return { line: 0, column: 0 };
//     }

//     // Compute column relative to the start of the current visual line.
//     // Strategy: use hit-testing at the left edge of the current line to get a range,
//     // then measure the text length from start to that range to get the line start index.
//     const currentRect = rects[rects.length - 1];
//     const yMid = (currentRect.top + currentRect.bottom) / 2;
//     const xStart = Math.floor(currentRect.left) + 1;

//     const getRangeFromPoint = (x: number, y: number): Range | null => {
//       const anyDoc = document as any;
//       if (typeof anyDoc.caretRangeFromPoint === "function") {
//         const r: Range | null = anyDoc.caretRangeFromPoint(x, y);
//         return r;
//       }
//       if (typeof anyDoc.caretPositionFromPoint === "function") {
//         const pos = anyDoc.caretPositionFromPoint(x, y);
//         if (pos) {
//           const r = document.createRange();
//           r.setStart(pos.offsetNode, pos.offset);
//           r.setEnd(pos.offsetNode, pos.offset);
//           return r;
//         }
//       }
//       return null;
//     };

//     let visualLineStartIndex = 0;
//     const lineStartRange = getRangeFromPoint(xStart, yMid);
//     if (lineStartRange && editable.contains(lineStartRange.startContainer)) {
//       const preLineStart = lineStartRange.cloneRange();
//       preLineStart.selectNodeContents(editable);
//       preLineStart.setEnd(
//         lineStartRange.startContainer,
//         lineStartRange.startOffset
//       );
//       visualLineStartIndex = preLineStart.toString().length;
//     } else {
//       // Fallback: compute start by subtracting characters until top changes (may be slower)
//       // This fallback will approximate by clamping to hard line start if hit-testing is unavailable.
//       const hardLines = text.split("\n");
//       let accumulated = 0;
//       for (let i = 0; i < hardLines.length; i++) {
//         const lineText = hardLines[i];
//         const lineEnd = accumulated + lineText.length;
//         if (caretAbsoluteIndex <= lineEnd) {
//           visualLineStartIndex = accumulated;
//           break;
//         }
//         accumulated = lineEnd + 1; // include newline
//       }
//     }

//     const column = Math.max(0, caretAbsoluteIndex - visualLineStartIndex);
//     return { line: visualLineIndex, column };
//   } catch (err) {
//     return { line: 0, column: 0 };
//   }
// }

export function getCaretPositionFromSelection(
  editable: HTMLElement
): CaretPosition {
  try {
    const doc = editable.ownerDocument || document;
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0) return { line: 0, column: 0 };

    const range = sel.getRangeAt(0);
    if (!editable.contains(range.endContainer)) return { line: 0, column: 0 };

    const pre = range.cloneRange();
    pre.selectNodeContents(editable);
    pre.setEnd(range.endContainer, range.endOffset);

    const rects = pre.getClientRects();
    if (!rects || rects.length === 0) return { line: 0, column: 0 };

    // Count visual lines (soft-wrap aware) by unique rounded top values
    const tops = new Set<number>();
    for (let i = 0; i < rects.length; i++) tops.add(Math.round(rects[i].top));
    const line = Math.max(0, tops.size - 1);

    const absolute = pre.toString().length;
    const text = editable.innerText || "";
    if (text.length === 0) return { line: 0, column: 0 };

    // Find start of current visual line via hit-testing at the true line's left edge
    const lastRect = rects[rects.length - 1];
    const currentTop = Math.round(lastRect.top);
    let lineLeft = lastRect.left;
    for (let i = 0; i < rects.length; i++) {
      if (Math.round(rects[i].top) === currentTop) {
        lineLeft = Math.min(lineLeft, rects[i].left);
      }
    }
    const y = (lastRect.top + lastRect.bottom) / 2;
    const x = Math.floor(lineLeft) + 1;

    let lineStartIndex = 0;
    const lineStartRange = getCaretRangeFromPoint(doc, x, y);
    if (lineStartRange && editable.contains(lineStartRange.startContainer)) {
      const preLine = lineStartRange.cloneRange();
      preLine.selectNodeContents(editable);
      preLine.setEnd(lineStartRange.startContainer, lineStartRange.startOffset);
      lineStartIndex = preLine.toString().length;
    } else {
      // Fallback: hard-line start using last newline before the caret
      lineStartIndex = text.lastIndexOf("\n", Math.max(0, absolute - 1)) + 1;
    }

    const column = Math.max(0, absolute - lineStartIndex);
    return { line, column };
  } catch {
    console.error("Error getting caret position from selection");
    return { line: 0, column: 0 };
  }
}

/**
 * Place the caret at the requested visual line and column inside the editable.
 * Clamps line/column to valid bounds. Uses soft-wrap aware line rects and
 * approximates horizontal placement based on line width.
 */
export function setCaretAtLineColumn(
  editable: HTMLElement,
  pos: CaretPosition
): void {
  try {
    const doc = editable.ownerDocument || document;
    const selection = doc.getSelection();
    if (!selection) return;

    // Full content range and length
    const contentRange = doc.createRange();
    contentRange.selectNodeContents(editable);
    const contentLen = contentRange.toString().length;

    const text = editable.innerText || "";
    if (text.length === 0) {
      const startRange = doc.createRange();
      startRange.selectNodeContents(editable);
      startRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(startRange);
      (editable as HTMLElement).focus();
      return;
    }

    // Soft-wrap-aware visual lines
    const lineRects = getVisualLineRects(editable);
    if (lineRects.length === 0) {
      editable.focus();
      return;
    }

    const clampedLine = Math.max(0, Math.min(pos.line, lineRects.length - 1));
    const lineRect = lineRects[clampedLine];
    const yMid = lineRect.top + lineRect.height / 2;

    // Start of current visual line
    const lineStartRange = getCaretRangeFromPoint(
      doc,
      Math.floor(lineRect.left) + 1,
      yMid
    );
    if (!lineStartRange) {
      editable.focus();
      return;
    }
    const preLineStart = lineStartRange.cloneRange();
    preLineStart.selectNodeContents(editable);
    preLineStart.setEnd(
      lineStartRange.startContainer,
      lineStartRange.startOffset
    );
    const lineStartIndex = preLineStart.toString().length;

    // Start of next visual line (or end of content)
    let nextLineStartIndex = contentLen;
    if (clampedLine + 1 < lineRects.length) {
      const nextRect = lineRects[clampedLine + 1];
      const nextStartRange = getCaretRangeFromPoint(
        doc,
        Math.floor(nextRect.left) + 1,
        nextRect.top + nextRect.height / 2
      );
      if (nextStartRange) {
        const preNext = nextStartRange.cloneRange();
        preNext.selectNodeContents(editable);
        preNext.setEnd(
          nextStartRange.startContainer,
          nextStartRange.startOffset
        );
        nextLineStartIndex = preNext.toString().length;
      }
    }

    const lineLen = Math.max(0, nextLineStartIndex - lineStartIndex);
    const clampedColumn = Math.max(0, Math.min(pos.column, lineLen));

    // Approximate x at desired column based on line width ratio
    const lineWidth = Math.max(1, lineRect.right - lineRect.left);
    const x =
      Math.floor(lineRect.left) +
      Math.floor((clampedColumn / Math.max(1, lineLen)) * (lineWidth - 1)) +
      1;
    const targetRange = getCaretRangeFromPoint(doc, x, yMid) || lineStartRange;

    selection.removeAllRanges();
    selection.addRange(targetRange);
    (editable as HTMLElement).focus();
  } catch {
    // no-op on failure
  }
}

/**
 * Get the current selection and extract block-data-id attributes from HTML elements.
 * Returns an array of block-data-id values found in the selected range.
 */
export function getSelectionBlockDataIds(): string[] {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return [];
    }

    const range = selection.getRangeAt(0);
    const blockDataIds: string[] = [];

    // Helper function to extract block-data-id from an element and its ancestors
    const extractBlockDataId = (element: Element): void => {
      let current: Element | null = element;
      while (current) {
        const blockDataId = current.getAttribute("block-data-id");
        if (blockDataId && !blockDataIds.includes(blockDataId)) {
          blockDataIds.push(blockDataId);
        }
        current = current.parentElement;
      }
    };

    // Get all elements within the selection range
    const commonAncestor = range.commonAncestorContainer;

    if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
      const element = commonAncestor as Element;
      extractBlockDataId(element);

      // Also check all child elements within the range
      const walker = document.createTreeWalker(
        commonAncestor,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            return range.intersectsNode(node)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        }
      );

      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          extractBlockDataId(currentNode as Element);
        }
        currentNode = walker.nextNode();
      }
    } else if (commonAncestor.nodeType === Node.TEXT_NODE) {
      // If the common ancestor is a text node, check its parent element
      const parentElement = commonAncestor.parentElement;
      if (parentElement) {
        extractBlockDataId(parentElement);
      }
    }

    // Also check the start and end containers of the range
    if (
      range.startContainer.nodeType === Node.TEXT_NODE &&
      range.startContainer.parentElement
    ) {
      extractBlockDataId(range.startContainer.parentElement);
    }
    if (
      range.endContainer.nodeType === Node.TEXT_NODE &&
      range.endContainer.parentElement
    ) {
      extractBlockDataId(range.endContainer.parentElement);
    }

    return blockDataIds;
  } catch (error) {
    console.error("Error getting selection block data IDs:", error);
    return [];
  }
}
