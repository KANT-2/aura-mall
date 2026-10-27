export const AUTH_CHANGED_KEY = "aura_member_changed_v1";
type MemberChange = { owner: string; kind: "profile" | "ended" | "session"; remote: boolean };
const listeners = new Set<(event: MemberChange) => void>();

export function publishMemberChange(owner: string, kind: MemberChange["kind"]) {
  for (const listener of listeners) {
    listener({ owner, kind, remote: false });
  }

  try {
    // Public identity and an invalidation nonce only; never credentials or profile data.
    localStorage.setItem(
      AUTH_CHANGED_KEY,
      JSON.stringify({ owner, kind, nonce: crypto.randomUUID() }),
    );
  } catch {
    // Query focus refetch remains available when browser storage is disabled.
  }
}

export function subscribeMemberChanges(listener: (event: MemberChange) => void) {
  listeners.add(listener);
  const receive = (event: StorageEvent) => {
    if (event.key !== AUTH_CHANGED_KEY || !event.newValue) {
      return;
    }

    try {
      const value = JSON.parse(event.newValue);
      if (
        typeof value?.owner === "string" &&
        value.owner.length <= 128 &&
        (value.kind === "profile" || value.kind === "ended" || value.kind === "session")
      ) {
        listener({ owner: value.owner, kind: value.kind, remote: true });
      }
    } catch {
      // Ignore malformed non-authoritative invalidation messages.
    }
  };
  window.addEventListener("storage", receive);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", receive);
  };
}
