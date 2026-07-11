// model.js — turns a flat list of messages + accounts into the cockpit model:
// resolves each message to an account, groups messages into threads, and tags
// each thread with its state + bucket. Everything the UI renders comes from here.

import { resolveAccount, buildDomainIndex, otherParty } from './routing.js';
import { computeThreadState } from './threadState.js';
import { threadBucket } from './buckets.js';

export const TRIAGE = '__triage__';

export function buildModel(accounts, messages) {
  const domainIdx = buildDomainIndex(accounts);

  messages.forEach(m => { m.account = resolveAccount(m, domainIdx); });

  const threadMap = new Map();
  messages.forEach(m => {
    const k = m.conversationId || m.id;
    if (!threadMap.has(k)) threadMap.set(k, []);
    threadMap.get(k).push(m);
  });

  const threads = [];
  threadMap.forEach((msgs, cid) => {
    const sorted = [...msgs].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
    const last = sorted[sorted.length - 1];
    const account = msgs.map(m => m.account).find(Boolean) || null;
    const state = computeThreadState(sorted);
    const bucket = threadBucket(sorted);
    const contact = otherParty(last) || sorted.map(otherParty).find(Boolean) || { name: '(unknown)', email: '' };
    threads.push({
      cid,
      accountKey: account || TRIAGE,
      account,
      state,
      bucket,
      subject: last.subject,
      contact,
      last,
      daysSince: state.days,
      msgs: sorted
    });
  });

  // Newest activity first.
  threads.sort((a, b) => new Date(b.last.receivedAt) - new Date(a.last.receivedAt));
  return { threads, accounts };
}

// --- slicing / grouping helpers the UI calls -------------------------------

export function threadsForAccount(threads, accountName) {
  return threads.filter(t => t.accountKey === accountName);
}

export function threadsForBucket(threads, bucketKey) {
  return threads.filter(t => t.bucket === bucketKey);
}

// Top slice-bar: cross-cutting filters over whatever list is showing.
export function passesSlice(t, slice) {
  switch (slice) {
    case 'all':     return true;
    case 'inbound': return t.msgs.some(m => m.direction === 'inbound');
    case 'owe':     return t.state.key === 'owe' || t.state.key === 'your_move';
    case 'chasing': return t.state.key === 'chasing';
    case 'cold':    return t.state.key === 'cold';
    default:        return true;
  }
}

export function accountCounts(threads, accounts) {
  const rows = accounts.map(a => ({
    name: a.name,
    count: threads.filter(t => t.accountKey === a.name).length
  }));
  const triage = threads.filter(t => t.accountKey === TRIAGE).length;
  return { rows, triage };
}

export function bucketCounts(threads) {
  const map = {};
  threads.forEach(t => { map[t.bucket] = (map[t.bucket] || 0) + 1; });
  return map;
}

export function subBucketCounts(threads, accountName) {
  const map = {};
  threads.filter(t => t.accountKey === accountName)
    .forEach(t => { map[t.bucket] = (map[t.bucket] || 0) + 1; });
  return map;
}
