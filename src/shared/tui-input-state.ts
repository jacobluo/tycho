export type InputWaitingPane = {
  status: "running" | "stopped" | "error";
  buffer: string;
};

const ansiPattern = /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
const controlPattern = /[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g;
const promptLinePattern = /(?:^|\n)\s*(?:[>›❯]\s*)$/;
const questionPattern = /(?:\?|？)\s*$/;
const confirmationPattern = /(?:\[[yYnN]\/[yYnN]\]|\([yYnN]\/[yYnN]\)|\[[yYnN]\]|type\s+['"`][^'"`]+['"`]\s+to\s+confirm|press\s+enter(?:\s+to\s+continue)?)[\s.。!！]*$/i;

export function isPaneWaitingForInput(pane: InputWaitingPane): boolean {
  if (pane.status !== "running") {
    return false;
  }
  const normalized = normalizeTerminalText(pane.buffer).slice(-2_000).trimEnd();
  if (!normalized) {
    return false;
  }
  return promptLinePattern.test(normalized) || questionPattern.test(normalized) || confirmationPattern.test(normalized);
}

function normalizeTerminalText(buffer: string): string {
  return buffer
    .replace(ansiPattern, "")
    .replace(/\r/g, "\n")
    .replace(controlPattern, "");
}
