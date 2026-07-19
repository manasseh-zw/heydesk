import JSZip from "jszip";

type DocumentStyleDefinition = {
  id: string;
  xml: string;
};

const WORDPROCESSING_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STYLES_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const STYLES_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const BODY_FONT = "Calibri";
const HEADING_FONT = "Georgia";
const STANDARD_STYLE_PRIORITIES = {
  Normal: 1,
  Title: 2,
  Subtitle: 3,
  Heading1: 4,
  Heading2: 5,
  Heading3: 6,
  Heading4: 7,
  Heading5: 8,
  Heading6: 9,
  Quote: 10,
} as const;

const STANDARD_DOCUMENT_STYLES: DocumentStyleDefinition[] = [
  {
    id: "Normal",
    xml: `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:uiPriority w:val="${STANDARD_STYLE_PRIORITIES.Normal}"/>
    <w:qFormat/>
    <w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="${BODY_FONT}"/></w:rPr>
  </w:style>`,
  },
  {
    id: "Title",
    xml: `<w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="${STANDARD_STYLE_PRIORITIES.Title}"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}" w:cs="${HEADING_FONT}"/><w:b/><w:bCs/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>
  </w:style>`,
  },
  {
    id: "Subtitle",
    xml: `<w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="${STANDARD_STYLE_PRIORITIES.Subtitle}"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="240" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:color w:val="666666"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr>
  </w:style>`,
  },
  headingStyle(
    "Heading1",
    "Heading 1",
    0,
    40,
    480,
    160,
    STANDARD_STYLE_PRIORITIES.Heading1,
  ),
  headingStyle(
    "Heading2",
    "Heading 2",
    1,
    32,
    360,
    120,
    STANDARD_STYLE_PRIORITIES.Heading2,
  ),
  headingStyle(
    "Heading3",
    "Heading 3",
    2,
    28,
    280,
    80,
    STANDARD_STYLE_PRIORITIES.Heading3,
  ),
  headingStyle(
    "Heading4",
    "Heading 4",
    3,
    24,
    240,
    60,
    STANDARD_STYLE_PRIORITIES.Heading4,
  ),
  headingStyle(
    "Heading5",
    "Heading 5",
    4,
    22,
    200,
    40,
    STANDARD_STYLE_PRIORITIES.Heading5,
  ),
  headingStyle(
    "Heading6",
    "Heading 6",
    5,
    22,
    160,
    40,
    STANDARD_STYLE_PRIORITIES.Heading6,
    true,
  ),
  {
    id: "Quote",
    xml: `<w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="${STANDARD_STYLE_PRIORITIES.Quote}"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160"/><w:ind w:left="720" w:right="720"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:i/><w:iCs/><w:color w:val="595959"/></w:rPr>
  </w:style>`,
  },
];

export async function ensureStandardDocumentStyles(
  input: Uint8Array,
  mode: "always" | "referenced" | "replace" = "always",
): Promise<{ buffer: Uint8Array; changed: boolean }> {
  const source = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const zip = await JSZip.loadAsync(source);
  const stylesFile = zip.file("word/styles.xml");
  const stylesXml = stylesFile ? await stylesFile.async("text") : null;
  const needsMissingStyles =
    mode === "always" ||
    mode === "replace" ||
    (await referencesUndefinedStandardStyle(zip, stylesXml));
  if (!stylesXml && !needsMissingStyles) {
    return { buffer: input, changed: false };
  }
  const withMissingStyles = stylesXml
    ? mode === "replace"
      ? replaceStandardStyles(stylesXml)
      : needsMissingStyles
        ? appendMissingStyles(stylesXml)
        : stylesXml
    : createStylesXml();
  const nextStylesXml = normalizeStandardStylePriorities(withMissingStyles);

  if (nextStylesXml === stylesXml) return { buffer: input, changed: false };

  zip.file("word/styles.xml", nextStylesXml);
  if (!stylesFile) await ensureStylesPackageReferences(zip);
  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { buffer, changed: true };
}

async function referencesUndefinedStandardStyle(
  zip: JSZip,
  stylesXml: string | null,
): Promise<boolean> {
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) return false;
  return STANDARD_DOCUMENT_STYLES.some(
    ({ id }) =>
      !stylesXml?.includes(`w:styleId="${id}"`) &&
      new RegExp(`w:pStyle[^>]+w:val=(?:"${id}"|'${id}')`).test(documentXml),
  );
}

function headingStyle(
  id: string,
  name: string,
  outlineLevel: number,
  fontSize: number,
  spaceBefore: number,
  spaceAfter: number,
  priority: number,
  italic = false,
): DocumentStyleDefinition {
  return {
    id,
    xml: `<w:style w:type="paragraph" w:styleId="${id}">
    <w:name w:val="${name}"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="${priority}"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="${outlineLevel}"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}" w:eastAsia="${HEADING_FONT}" w:cs="${HEADING_FONT}"/><w:b/><w:bCs/>${italic ? "<w:i/><w:iCs/>" : ""}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>
  </w:style>`,
  };
}

function appendMissingStyles(stylesXml: string): string {
  const closingIndex = stylesXml.lastIndexOf("</w:styles>");
  if (closingIndex < 0)
    throw new Error("The document styles part is malformed.");
  const missing = STANDARD_DOCUMENT_STYLES.filter(
    ({ id }) => !hasStyle(stylesXml, id),
  );
  if (missing.length === 0) return stylesXml;
  const additions = missing.map(({ xml }) => `  ${xml}`).join("\n");
  return `${stylesXml.slice(0, closingIndex)}${additions}\n${stylesXml.slice(closingIndex)}`;
}

function replaceStandardStyles(stylesXml: string): string {
  const withoutStandardStyles = STANDARD_DOCUMENT_STYLES.reduce(
    (currentXml, { id }) => {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stylePattern = new RegExp(
        `<w:style\\b(?=[^>]*\\bw:styleId=(?:"${escapedId}"|'${escapedId}'))[^>]*>[\\s\\S]*?<\\/w:style>`,
        "g",
      );
      return currentXml.replace(stylePattern, "");
    },
    stylesXml,
  );
  const closingIndex = withoutStandardStyles.lastIndexOf("</w:styles>");
  if (closingIndex < 0)
    throw new Error("The document styles part is malformed.");
  const replacements = STANDARD_DOCUMENT_STYLES.map(
    ({ xml }) => `  ${xml}`,
  ).join("\n");
  return `${withoutStandardStyles.slice(0, closingIndex)}${replacements}\n${withoutStandardStyles.slice(closingIndex)}`;
}

function normalizeStandardStylePriorities(stylesXml: string): string {
  return Object.entries(STANDARD_STYLE_PRIORITIES).reduce(
    (currentXml, [styleId, priority]) => {
      const escapedId = styleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stylePattern = new RegExp(
        `<w:style\\b[^>]*w:styleId=(?:"${escapedId}"|'${escapedId}')[^>]*>[\\s\\S]*?</w:style>`,
      );
      return currentXml.replace(stylePattern, (styleXml) => {
        if (/<w:uiPriority\b[^>]*\/>/.test(styleXml)) {
          return styleXml.replace(
            /<w:uiPriority\b[^>]*\/>/,
            `<w:uiPriority w:val="${priority}"/>`,
          );
        }
        return styleXml.replace(
          /(<w:name\b[^>]*\/>)/,
          `$1\n    <w:uiPriority w:val="${priority}"/>`,
        );
      });
    },
    stylesXml,
  );
}

function createStylesXml(): string {
  const styles = STANDARD_DOCUMENT_STYLES.map(({ xml }) => `  ${xml}`).join(
    "\n",
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORDPROCESSING_NAMESPACE}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
${styles}
</w:styles>`;
}

function hasStyle(stylesXml: string, styleId: string): boolean {
  const escaped = styleId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`w:styleId=(?:"${escaped}"|'${escaped}')`).test(stylesXml);
}

async function ensureStylesPackageReferences(zip: JSZip): Promise<void> {
  const contentTypesFile = zip.file("[Content_Types].xml");
  const contentTypes = await contentTypesFile?.async("text");
  if (!contentTypes)
    throw new Error("The document content types part is missing.");
  if (!contentTypes.includes(STYLES_CONTENT_TYPE)) {
    zip.file(
      "[Content_Types].xml",
      insertBeforeClosingTag(
        contentTypes,
        "Types",
        `  <Override PartName="/word/styles.xml" ContentType="${STYLES_CONTENT_TYPE}"/>`,
      ),
    );
  }

  const relationshipsPath = "word/_rels/document.xml.rels";
  const relationshipsFile = zip.file(relationshipsPath);
  const relationships = await relationshipsFile?.async("text");
  if (!relationships)
    throw new Error("The document relationships part is missing.");
  if (!relationships.includes(STYLES_RELATIONSHIP_TYPE)) {
    zip.file(
      relationshipsPath,
      insertBeforeClosingTag(
        relationships,
        "Relationships",
        `  <Relationship Id="${nextRelationshipId(relationships)}" Type="${STYLES_RELATIONSHIP_TYPE}" Target="styles.xml"/>`,
      ),
    );
  }
}

function insertBeforeClosingTag(
  source: string,
  tag: string,
  value: string,
): string {
  const closing = `</${tag}>`;
  const index = source.lastIndexOf(closing);
  if (index < 0) throw new Error(`The document ${tag} part is malformed.`);
  return `${source.slice(0, index)}${value}\n${source.slice(index)}`;
}

function nextRelationshipId(source: string): string {
  let maximum = 0;
  for (const match of source.matchAll(/\bId=["']rId(\d+)["']/g)) {
    maximum = Math.max(maximum, Number(match[1]));
  }
  return `rId${maximum + 1}`;
}
