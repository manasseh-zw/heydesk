import { describe, expect, it } from "vitest";

import { presentAssistantActivity } from "../assistant-activity-presentation";

describe("assistant activity presentation", () => {
  it("turns shell reads into a page activity", () => {
    expect(
      presentAssistantActivity(
        "heydesk.command",
        JSON.stringify({
          command:
            "/bin/zsh -lc \"sed -n '1,240p' 'pages/History of Rome Essay Template.md'\"",
        }),
      ),
    ).toEqual({
      label: "Read page",
      target: "History of Rome Essay Template.md",
      shellCommand: true,
    });
  });

  it("turns file discovery into a workspace review", () => {
    expect(
      presentAssistantActivity(
        "heydesk.command",
        JSON.stringify({ command: "pwd && rg --files -g 'pages/**'" }),
      ),
    ).toEqual({
      label: "Review workspace files",
      target: "Pages",
      shellCommand: true,
    });
  });

  it("keeps document tools specific and readable", () => {
    expect(
      presentAssistantActivity(
        "heydesk.dynamic-tool.suggest_change",
        JSON.stringify({ path: "documents/Essay.docx" }),
      ),
    ).toEqual({
      label: "Suggest change",
      target: "documents/Essay.docx",
      shellCommand: false,
    });
  });
});
