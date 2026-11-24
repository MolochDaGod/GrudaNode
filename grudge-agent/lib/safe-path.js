/**
 * Confine agent and IDE file access to a workspace root.
 *
 * resolveInside(root, p, { write }) returns an absolute real path inside
 * realpath(root), or throws. It follows symlinks (realpath of the target, or of
 * its nearest existing parent for new files), and refuses:
 *   - anything outside the root (.., absolute paths elsewhere, symlink escapes)
 *   - any path segment that starts with "." (dotfiles: .env, .git, .ssh, …)
 *   - env-style files (*.env, env.local, …) and key material (*.pem, *.key, id_rsa)
 *   - roots that are system folders (/, /proc, /sys, /dev, /etc, home itself)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const BLOCKED_ROOTS = ["/", "/proc", "/sys", "/dev", "/etc", "/root", "/var", "/usr", "/bin", "/boot"];
const BLOCKED_NAME = /(^|\.)env(\..*)?$|\.(pem|key|p12|pfx|keystore)$|^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$|^credentials(\.json)?$/i;

class PathError extends Error {
  constructor(msg) { super(msg); this.code = "EPATH"; }
}

function realRoot(root) {
  const abs = path.resolve(String(root || ""));
  fs.mkdirSync(abs, { recursive: true });
  const real = fs.realpathSync(abs);
  if (BLOCKED_ROOTS.includes(real) || real === path.resolve(os.homedir())) {
    throw new PathError(`refusing workspace root: ${real}`);
  }
  for (const b of ["/proc", "/sys", "/dev", "/etc"]) {
    if (real === b || real.startsWith(b + path.sep)) throw new PathError(`refusing workspace root: ${real}`);
  }
  return real;
}

function nearestExisting(p) {
  let cur = p;
  while (!fs.existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return cur;
}

function resolveInside(root, p, opts) {
  opts = opts || {};
  const base = realRoot(root);
  const raw = p == null || p === "" ? "." : String(p);
  if (raw.includes("\0")) throw new PathError("bad path");
  const candidate = path.resolve(base, raw);
  const rel = path.relative(base, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new PathError(`outside workspace: ${raw}`);
  const segs = rel ? rel.split(path.sep) : [];
  for (const s of segs) {
    if (s.startsWith(".")) throw new PathError(`hidden files are blocked: ${raw}`);
    if (BLOCKED_NAME.test(s)) throw new PathError(`blocked file name: ${s}`);
  }
  // Follow symlinks: the real target (or its nearest existing parent) must stay inside.
  const existing = nearestExisting(candidate);
  const real = fs.realpathSync(existing);
  if (real !== base && !real.startsWith(base + path.sep)) throw new PathError(`outside workspace (link): ${raw}`);
  const finalPath = existing === candidate ? real : path.join(real, path.relative(existing, candidate));
  if (opts.mustExist && !fs.existsSync(finalPath)) throw new PathError(`not found: ${raw}`);
  return finalPath;
}

/** Safe single path segment for a project / user folder name. */
function safeSegment(name, fallback) {
  const s = String(name || "").replace(/[^a-zA-Z0-9_\- ]/g, "_").replace(/^[_ .-]+/, "").slice(0, 80);
  return s || fallback || "_default";
}

module.exports = { resolveInside, safeSegment, realRoot, PathError, BLOCKED_NAME };
