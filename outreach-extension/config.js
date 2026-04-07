// IBISWorld Outreach — configuration v3.0
// ─────────────────────────────────────────────────────────────────────────────
// Adjust OVERDUE_DAYS to change when a thread is considered overdue.

const IBIS_CONFIG = {

  // ── Staleness threshold ──────────────────────────────────────────────────
  // Days since last email activity before a thread is flagged as overdue.
  // Affects: folder badge count + row dot color (goes orange/red at this point).
  OVERDUE_DAYS: 3,

};

// Note: content.js reads OVERDUE_DAYS directly from the constant defined there.
// This config file is kept for reference and future extension.
