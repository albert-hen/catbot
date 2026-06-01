/**
 * MCTS memory budget
 *
 * The persistent MCTS tree is the dominant source of runtime memory.
 * Mobile Safari (iOS) aggressively kills tabs that grow past ~1GB, so we
 * cap the tree to a fixed memory budget. The cap is derived from a runtime
 * measurement of how many bytes a single tree node actually occupies, using
 * the exact same data structures the worker creates.
 *
 * The same cap doubles as the maximum number of MCTS simulations the UI
 * will allow: with clear-on-turn, the tree starts empty each position and
 * grows by at most one node per simulation, so N sims => at most N nodes.
 */

import { ACTION_SIZE } from './tensor';

/** Memory we allow the MCTS tree to occupy. */
export const MCTS_MEMORY_BUDGET_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Measure the bytes occupied by one tree node using the same typed-array
 * and Map-entry shapes the worker creates.  Must be called after the
 * application is loaded (not at top-level import time) because it relies
 * on the Maps being available and the engine having warmed up.
 *
 * Accounts for:
 *  - Float32Array(ACTION_SIZE) for Ps priors
 *  - Uint8Array(ceil(ACTION_SIZE/8)) for Vs bitmask
 *  - Map entry overhead (multiplied by the number of maps each key appears in)
 *  - Key string storage (state hash + edge key, amortised)
 */
export function measureNodeBytes(): number {
  const trialKey = '#'.repeat(155); // representative state-hash length
  const trialEdgeKey = '#'.repeat(165);

  // Typed-array payloads (live in the ArrayBuffer heap, not GC overhead)
  const ps = new Float32Array(ACTION_SIZE);
  const vs = new Uint8Array(Math.ceil(ACTION_SIZE / 8));
  const payloadBytes = ps.byteLength + vs.byteLength; // Float32 * 188 + Uint8 * 24

  // Map-entry overhead.  Each (key, value) pair costs roughly:
  //   - an internal hash-table entry (~24 B in V8, empirical)
  //   - a PropertyDescriptor for the key (~32 B)
  //   - the typed-array object itself (~40 B) once per map per key
  const ENTRY_OVERHEAD = 24 + 32;       // per (key, value) in a Map
  const ARRAY_OBJECT = 40;               // typed-array object overhead

  // The six Maps: Ns, Es, Ps, Vs, Qsa, Nsa
  //   Ns, Es   -> value is a number (primitive, no extra object)
  //   Ps, Vs   -> value is a typed array (1 array-object overhead each)
  //   Qsa, Nsa -> key is edgeKey, value is a number
  //   On average each node creates ~1 unique edge key (the edge that
  //   reached it from its parent), so we charge one edge-key entry.
  const MAPS_FOR_STATE_KEY = 4; // Ns, Es, Ps, Vs
  const MAPS_FOR_EDGE_KEY = 2; // Qsa, Nsa
  const stateKeyEntries = MAPS_FOR_STATE_KEY * ENTRY_OVERHEAD;
  const edgeKeyEntries = MAPS_FOR_EDGE_KEY * ENTRY_OVERHEAD;
  const arrayObjects = 2 * ARRAY_OBJECT; // one for Ps, one for Vs

  // Key strings. The state key is shared across 4 maps; the edge key
  // is shared across 2 maps.  JS strings cost ~2 bytes per UTF-16 code
  // unit plus ~24 bytes of object overhead.  Each Map entry stores its
  // own reference to the shared string, so we count the string once.
  const STRING_OVERHEAD = 24;
  const stateKeyBytes = trialKey.length * 2 + STRING_OVERHEAD;
  const edgeKeyBytes = trialEdgeKey.length * 2 + STRING_OVERHEAD;
  const amortisedEdgeKeyBytes = edgeKeyBytes; // ~1 edge per node

  return (
    payloadBytes +
    stateKeyEntries +
    edgeKeyEntries +
    arrayObjects +
    stateKeyBytes +
    amortisedEdgeKeyBytes
  );
}

/** Maximum number of nodes the tree may hold within the memory budget. */
export const MAX_NODES = Math.floor(
  MCTS_MEMORY_BUDGET_BYTES / measureNodeBytes()
);
