// threadState.js — computes "where am I at" for a thread. The copilot layer.
// Not automation: it just labels each thread so Dan sees where to focus.

const DAY = 86400000;
const FRESH_DAYS = 2;   // a reply within this window = hot "your move"
const COLD_DAYS = 120;  // no activity this long = cold / re-engage

export const STATES = {
  your_move: { key: 'your_move', label: 'they replied · your move', cls: 'st-green', emoji: '↩' },
  owe:       { key: 'owe',       label: 'you owe a reply',          cls: 'st-amber', emoji: '⏳' },
  waiting:   { key: 'waiting',   label: 'waiting on them',          cls: 'st-blue',  emoji: '📨' },
  chasing:   { key: 'chasing',   label: 'chasing',                  cls: 'st-red',   emoji: '🎣' },
  cold:      { key: 'cold',      label: 'cold · re-engage?',        cls: 'st-grey',  emoji: '❄' }
};

function daysBetween(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

// msgs: array of messages in one thread (any order).
export function computeThreadState(msgs) {
  const sorted = [...msgs].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
  const last = sorted[sorted.length - 1];
  const daysSince = daysBetween(last.receivedAt);

  if (daysSince >= COLD_DAYS) return { ...STATES.cold, days: daysSince };

  if (last.direction === 'inbound') {
    // Ball is in Dan's court.
    if (daysSince <= FRESH_DAYS) return { ...STATES.your_move, days: daysSince };
    return { ...STATES.owe, days: daysSince };
  }

  // Last message was outbound -> waiting on them. Count how many times Dan has
  // messaged since their last reply (trailing outbound run).
  let trailing = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].direction === 'outbound') trailing++;
    else break;
  }
  if (trailing >= 2) return { ...STATES.chasing, days: daysSince, depth: trailing };
  return { ...STATES.waiting, days: daysSince };
}
