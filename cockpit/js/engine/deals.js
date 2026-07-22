// deals.js — fuses email activity with deal progression from the dashboard.
// The dashboard's per-account markup (stage, priority, status, headline) is the
// same signal Dan sets there; here it turns the cockpit into a revenue cockpit:
// every thread reads in the context of where the deal stands, and a Focus list
// ranks "respond here to advance a real deal".

// Action stage (deal progression) — mirrors the dashboard ACTION_STAGES.
export const STAGES = {
  new_sequence:     { label: 'New Sequence',     emoji: '🚀', cls: 'dl-green'  },
  multithreading:   { label: 'Multi-thread',     emoji: '👥', cls: 'dl-indigo' },
  active_opp:       { label: 'Active Opp',        emoji: '💼', cls: 'dl-amber'  },
  active_proposal:  { label: 'Active Proposal',   emoji: '📋', cls: 'dl-purple' },
  stalled:          { label: 'Stalled',           emoji: '⏸', cls: 'dl-orange' },
  future_reconnect: { label: 'Future Reconnect',  emoji: '🔮', cls: 'dl-slate'  },
  internal_support: { label: 'Internal Support',  emoji: '🛟', cls: 'dl-cyan'   },
  tabled:           { label: 'Tabled',            emoji: '🗄', cls: 'dl-grey'   },
  unresponsive:     { label: 'Unresponsive',      emoji: '🚫', cls: 'dl-grey'   },
  won:              { label: 'Won',               emoji: '🏆', cls: 'dl-green'  },
  nurture:          { label: 'Nurture',           emoji: '🌱', cls: 'dl-green'  }
};

// Priority — mirrors the dashboard acctPrio. rank: lower = more urgent.
export const PRIOS = {
  immediate:  { label: 'Immediate',  emoji: '🆘', cls: 'dl-crimson', rank: 0 },
  urgent:     { label: 'Urgent',     emoji: '🚨', cls: 'dl-red',     rank: 1 },
  prioritize: { label: 'Prioritize', emoji: '📌', cls: 'dl-amber',   rank: 2 },
  working:    { label: 'Working',    emoji: '🛠', cls: 'dl-blue',    rank: 3 },
  teamsell:   { label: 'Team-Sell',  emoji: '🤝', cls: 'dl-teal',    rank: 4 },
  tabled:     { label: 'Tabled',     emoji: '🗄', cls: 'dl-grey',    rank: 5 }
};

export function stageInfo(key) { return STAGES[key] || null; }
export function prioInfo(key)  { return PRIOS[key] || null; }

// A live deal = one Dan has prioritized or moved into an opp/proposal stage.
export function isLiveDeal(deal) {
  if (!deal) return false;
  return !!deal.prio || deal.stage === 'active_opp' || deal.stage === 'active_proposal';
}

// Focus = ball is in Dan's court (respond) AND it's a real/prioritized deal.
// This is the revenue-winning shortlist: reply here to advance a live deal.
export function isFocus(thread) {
  const actionable = thread.state.key === 'your_move' || thread.state.key === 'owe';
  return actionable && isLiveDeal(thread.deal);
}

// Revenue rank for the Focus list: highest priority first, then which side the
// ball is on, then most-recent. Lower = higher on the list.
export function focusRank(thread) {
  const d = thread.deal || {};
  const prioRank = d.prio && PRIOS[d.prio] ? PRIOS[d.prio].rank : 6;
  const stageBoost = (d.stage === 'active_proposal') ? 0 : (d.stage === 'active_opp' ? 1 : 2);
  const stateTier = thread.state.key === 'your_move' ? 0 : 1; // your_move before owe
  return prioRank * 100 + stageBoost * 10 + stateTier;
}
