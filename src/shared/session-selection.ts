export type SelectableWindow = {
  id: string;
  activePaneId: string;
};

export type SessionSelectionState = {
  localActivePaneId: string | null;
  serverActivePaneId: string | null;
  serverActiveWindowId: string | null;
};

function windowIdForPane(windows: SelectableWindow[], paneId: string | null): string | null {
  if (!paneId) {
    return null;
  }
  return windows.find((windowState) => windowState.activePaneId === paneId)?.id ?? null;
}

export function resolveSelectedWindowId(windows: SelectableWindow[], selection: SessionSelectionState): string | null {
  const localWindowId = windowIdForPane(windows, selection.localActivePaneId);
  if (localWindowId) {
    return localWindowId;
  }

  const serverPaneWindowId = windowIdForPane(windows, selection.serverActivePaneId);
  if (serverPaneWindowId) {
    return serverPaneWindowId;
  }

  return windows.some((windowState) => windowState.id === selection.serverActiveWindowId) ? selection.serverActiveWindowId : null;
}
