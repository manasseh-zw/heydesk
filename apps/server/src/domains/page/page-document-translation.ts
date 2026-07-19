import JSZip from "jszip";

import { ensureStandardDocumentStyles } from "../document/document-styles";

const highlightStart = "\uE000HEYDESK_HIGHLIGHT_START\uE001";
const highlightEnd = "\uE000HEYDESK_HIGHLIGHT_END\uE001";

export const pageDocumentStyle = {
  titleSize: 40,
  heading1Size: 40,
  heading2Size: 32,
  heading3Size: 28,
  heading4Size: 24,
  heading5Size: 22,
  heading6Size: 22,
  paragraphSize: 22,
  listItemSize: 22,
  blockquoteSize: 22,
  headingSpacing: 240,
  paragraphSpacing: 200,
  lineSpacing: 1.15,
} as const;

export function translatePageMarkdownForWord(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((block, blockIndex) => {
      if (blockIndex % 2 === 1) return block;
      return block
        .split(/(`+[^`]*`+)/g)
        .map((part, partIndex) => {
          if (partIndex % 2 === 1) return part;
          return part.replace(
            /==([^=\n]+)==/g,
            `${highlightStart}$1${highlightEnd}`,
          );
        })
        .join("");
    })
    .join("");
}

export async function normalizePageDocumentForEditor(
  input: Uint8Array,
): Promise<Uint8Array> {
  const source = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const zip = await JSZip.loadAsync(source);
  const documentFile = zip.file("word/document.xml");
  const documentXml = await documentFile?.async("text");
  if (!documentXml) throw new Error("The converted Word document has no body.");

  const normalizedDocumentXml = applyHighlights(
    documentXml.replace(
      /<w:pStyle\b([^>]*?)w:val=(?:"([1-6])"|'([1-6])')([^>]*?)\/>/g,
      (
        _match,
        before: string,
        doubleQuoted?: string,
        singleQuoted?: string,
        after?: string,
      ) =>
        `<w:pStyle${before}w:val="Heading${doubleQuoted ?? singleQuoted}"${after ?? ""}/>`,
    ),
  );
  if (
    normalizedDocumentXml.includes(highlightStart) ||
    normalizedDocumentXml.includes(highlightEnd)
  ) {
    throw new Error("A page highlight could not be translated to Word.");
  }
  zip.file("word/document.xml", normalizedDocumentXml);
  const normalizedPackage = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return (await ensureStandardDocumentStyles(normalizedPackage, "replace"))
    .buffer;
}

function applyHighlights(documentXml: string): string {
  let highlighted = false;
  const translated = documentXml.replace(
    /<w:r(\s[^>]*)?>([\s\S]*?)<\/w:r>/g,
    (runXml, runAttributes = "", runBody: string) => {
      const textMatch = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/.exec(runBody);
      if (!textMatch) return highlighted ? highlightRun(runXml) : runXml;
      const text = textMatch[2] ?? "";
      if (!text.includes(highlightStart) && !text.includes(highlightEnd)) {
        return highlighted ? highlightRun(runXml) : runXml;
      }

      const pieces = text.split(
        new RegExp(`(${highlightStart}|${highlightEnd})`, "g"),
      );
      const runs: string[] = [];
      for (const piece of pieces) {
        if (piece === highlightStart) {
          highlighted = true;
          continue;
        }
        if (piece === highlightEnd) {
          highlighted = false;
          continue;
        }
        if (!piece) continue;
        const textAttributes = preserveWhitespace(textMatch[1] ?? "", piece);
        const body = runBody.replace(
          textMatch[0],
          `<w:t${textAttributes}>${piece}</w:t>`,
        );
        const splitRun = `<w:r${runAttributes}>${body}</w:r>`;
        runs.push(highlighted ? highlightRun(splitRun) : splitRun);
      }
      return runs.join("");
    },
  );
  if (highlighted)
    throw new Error("A page contains an unmatched highlight marker.");
  return translated;
}

function highlightRun(runXml: string): string {
  if (/<w:highlight\b/.test(runXml)) return runXml;
  if (/<w:rPr\b[^>]*\/>/.test(runXml)) {
    return runXml.replace(
      /<w:rPr\b([^>]*)\/>/,
      `<w:rPr$1><w:highlight w:val="yellow"/></w:rPr>`,
    );
  }
  if (/<w:rPr\b[^>]*>/.test(runXml)) {
    return runXml.replace(/<\/w:rPr>/, `<w:highlight w:val="yellow"/></w:rPr>`);
  }
  return runXml.replace(
    /(<w:r\b[^>]*>)/,
    `$1<w:rPr><w:highlight w:val="yellow"/></w:rPr>`,
  );
}

function preserveWhitespace(attributes: string, text: string): string {
  if (!/^\s|\s$/.test(text) || /\bxml:space=/.test(attributes)) {
    return attributes;
  }
  return `${attributes} xml:space="preserve"`;
}
