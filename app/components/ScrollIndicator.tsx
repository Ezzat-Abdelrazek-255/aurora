// Renamed in spirit to "spinner" — kept the file/export name so existing
// imports keep working. Pure CSS rotating ring, fixed bottom-right.

export function ScrollIndicator() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8"
    >
      <span
        className="block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
        style={{ animationDuration: "0.9s" }}
      />
    </div>
  );
}
