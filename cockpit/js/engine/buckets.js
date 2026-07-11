// buckets.js — sub-folders inside each account (and the cross-account "by bucket" views).
// v1 defaults: Inbound / Outreach / Churn / Active deal.
//
// Inbound vs Outreach is derived reliably from who started the thread.
// Churn / Active deal need dashboard signal (campaign membership, live opp) —
// for now a message can carry an explicit `bucket` tag as the seam where that
// dashboard signal will plug in. See EMAIL-COCKPIT.md.

export const BUCKETS = [
  { key: 'inbound',  label: 'Inbound',     emoji: '📥' },
  { key: 'outreach', label: 'Outreach',    emoji: '📣' },
  { key: 'churn',    label: 'Churn',       emoji: '🔥' },
  { key: 'active',   label: 'Active deal', emoji: '💼' }
];

export function threadBucket(msgs) {
  const tagged = msgs.find(m => m.bucket);
  if (tagged) return tagged.bucket;
  const sorted = [...msgs].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
  return sorted[0].direction === 'inbound' ? 'inbound' : 'outreach';
}
