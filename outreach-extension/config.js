// IBISWorld Outreach — configuration v1.0
// ─────────────────────────────────────────────────────────────────────────────
// Single place to tune the extension. Edit MY_EMAIL if your address changes.
// All scan thresholds can be adjusted here without touching any other file.

const IBIS_CONFIG = {

  // ── Identity ────────────────────────────────────────────────────────────
  // Your work email — tells the engine apart emails you sent vs. received
  MY_EMAIL: 'daniel.starr@ibisworld.com',

  // ── Scan behaviour ──────────────────────────────────────────────────────
  // Minutes before a contact's email cache is considered stale
  CACHE_TTL_MINUTES: 30,

  // Most recent N emails to pull per contact
  EMAIL_HISTORY_DEPTH: 20,

  // Contacts to scan in parallel (higher = faster, more Outlook load)
  BATCH_SIZE: 4,

  // ── Priority thresholds ──────────────────────────────────────────────────
  // Days since last outbound before "Sent Recently" becomes "Email Today"
  EMAIL_TODAY_DAYS: 3,

  // ── Stale detection ──────────────────────────────────────────────────────
  // Consecutive outbound emails with no reply before flagging stale
  STALE_OUTBOUND_STREAK: 5,

  // Total days of silence (sent or received) before flagging stale
  STALE_DAYS_THRESHOLD: 60,

};
