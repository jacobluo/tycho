export type SessionLayoutMode = "auto" | "single" | "two-vertical" | "two-horizontal" | "quad";
export type SessionSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4";
export type SlotAssignments = Record<SessionSlotId, string | null>;

export const allSessionSlotIds: SessionSlotId[] = ["slot-1", "slot-2", "slot-3", "slot-4"];

export function createEmptySlotAssignments(): SlotAssignments {
  return {
    "slot-1": null,
    "slot-2": null,
    "slot-3": null,
    "slot-4": null
  };
}

export function resolveVisibleSlotIds(mode: SessionLayoutMode, viewportWidth: number): SessionSlotId[] {
  if (viewportWidth < 760) {
    return ["slot-1"];
  }
  if (mode === "single") {
    return ["slot-1"];
  }
  if (mode === "two-vertical" || mode === "two-horizontal") {
    return ["slot-1", "slot-2"];
  }
  if (mode === "quad") {
    return allSessionSlotIds;
  }
  if (viewportWidth < 1180) {
    return ["slot-1", "slot-2"];
  }
  return allSessionSlotIds;
}

export function assignWindowToSlot(assignments: SlotAssignments, slotId: SessionSlotId, windowId: string | null): SlotAssignments {
  const nextAssignments = { ...assignments };
  for (const currentSlotId of allSessionSlotIds) {
    if (windowId && nextAssignments[currentSlotId] === windowId) {
      nextAssignments[currentSlotId] = null;
    }
  }
  nextAssignments[slotId] = windowId;
  return nextAssignments;
}

export function clearWindowFromSlots(assignments: SlotAssignments, windowId: string): SlotAssignments {
  const nextAssignments = { ...assignments };
  for (const slotId of allSessionSlotIds) {
    if (nextAssignments[slotId] === windowId) {
      nextAssignments[slotId] = null;
    }
  }
  return nextAssignments;
}

export function pruneSlotAssignments(assignments: SlotAssignments, liveWindowIds: string[]): SlotAssignments {
  const liveIds = new Set(liveWindowIds);
  const nextAssignments = { ...assignments };
  for (const slotId of allSessionSlotIds) {
    const windowId = nextAssignments[slotId];
    if (windowId && !liveIds.has(windowId)) {
      nextAssignments[slotId] = null;
    }
  }
  return nextAssignments;
}
