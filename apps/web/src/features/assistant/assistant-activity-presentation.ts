export type AssistantActivityPresentation = {
  label: string;
  target?: string;
  shellCommand: boolean;
};

export function presentAssistantActivity(
  name: string,
  argumentsValue: string,
): AssistantActivityPresentation {
  const tool = name.split(/[.:]/).at(-1) ?? name;
  const record = parseActivityArguments(argumentsValue);

  if (isShellTool(tool)) return presentShellActivity(record);

  const labels: Record<string, string> = {
    add_comment: "Add comment",
    append_paragraphs: "Add content",
    apply_formatting: "Format text",
    file_change: "Update file",
    fileChange: "Update file",
    find_text: "Find text",
    read_comments: "Read comments",
    read_document: "Read document",
    read_page: "Read page",
    read_pages: "Read pages",
    read_selection: "Read selection",
    set_paragraph_style: "Apply style",
    suggest_change: "Suggest change",
  };

  return {
    label: labels[tool] ?? titleCase(tool),
    target: extractActivityTarget(record),
    shellCommand: false,
  };
}

export function parseActivityArguments(
  argumentsValue: string,
): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(argumentsValue);
    if (!value || typeof value !== "object") return {};
    const record = value as Record<string, unknown>;
    return record.arguments && typeof record.arguments === "object"
      ? (record.arguments as Record<string, unknown>)
      : record;
  } catch {
    return {};
  }
}

function presentShellActivity(
  record: Record<string, unknown>,
): AssistantActivityPresentation {
  const command = typeof record.command === "string" ? record.command : "";
  const path = extractWorkspaceFile(command);
  const target = path ? fileName(path) : undefined;

  if (/\b(?:sed|cat|head|tail)\b/.test(command) && path) {
    return {
      label: path.startsWith("documents/") ? "Read document" : "Read page",
      target,
      shellCommand: true,
    };
  }
  if (/\brg\b/.test(command) && !/\brg\s+--files\b/.test(command)) {
    return {
      label: path ? "Search file" : "Search workspace",
      target,
      shellCommand: true,
    };
  }
  if (/\b(?:rg\s+--files|find|ls)\b/.test(command)) {
    return {
      label: "Review workspace files",
      target: workspaceArea(command),
      shellCommand: true,
    };
  }
  return {
    label: "Run workspace task",
    target,
    shellCommand: true,
  };
}

function isShellTool(tool: string): boolean {
  const normalized = tool.toLowerCase();
  return normalized.includes("command") || normalized.includes("exec");
}

function extractWorkspaceFile(command: string): string | undefined {
  const quoted = [
    ...command.matchAll(/["']((?:pages|documents)\/[^"']+\.(?:mdx?|docx))["']/gi),
  ];
  const quotedPath = quoted.at(-1)?.[1];
  if (quotedPath) return quotedPath;

  return command.match(
    /(?:^|\s)((?:pages|documents)\/[^\s"']+\.(?:mdx?|docx))/i,
  )?.[1];
}

function extractActivityTarget(
  record: Record<string, unknown>,
): string | undefined {
  for (const key of ["path", "file", "target", "query", "search"]) {
    if (typeof record[key] === "string") return truncate(record[key], 48);
  }
  const changes = Array.isArray(record.changes) ? record.changes : [];
  const firstChange = changes[0];
  if (firstChange && typeof firstChange === "object") {
    const path = (firstChange as Record<string, unknown>).path;
    if (typeof path === "string") {
      return changes.length === 1
        ? truncate(fileName(path), 48)
        : `${changes.length} files`;
    }
  }
  if (Array.isArray(record.paragraphs)) {
    return `${record.paragraphs.length} paragraphs`;
  }
  return undefined;
}

function workspaceArea(command: string): string | undefined {
  if (/\bpages(?:\/|\b)/i.test(command)) return "Pages";
  if (/\bdocuments(?:\/|\b)/i.test(command)) return "Documents";
  return undefined;
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
