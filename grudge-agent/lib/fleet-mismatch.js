"use strict";

const NEXUS = (process.env.GRUDGE_NEXUS_URL || "https://grudachain.grudge-studio.com").replace(/\/$/, "");

async function fetchFleetMismatch() {
  const res = await fetch(`${NEXUS}/api/fleet/mismatch`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Fleet mismatch ${res.status}`);
  return res.json();
}

module.exports = { fetchFleetMismatch, NEXUS };