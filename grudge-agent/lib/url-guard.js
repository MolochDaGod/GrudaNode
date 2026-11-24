/**
 * Blocks agent web fetches to loopback, private, link-local, site-local, ULA,
 * metadata and other non-public hosts.
 *
 *   checkPublicUrl(url)        sync: scheme + literal host checks (IP literals in any
 *                              form, *.localhost/.internal/.local, metadata names, and
 *                              hostnames that embed a private IPv4 such as
 *                              127.0.0.1.nip.io or 10-0-0-1.sslip.io)
 *   assertPublicUrl(url, opts) async: the above, then resolves DNS and checks EVERY
 *                              address (so rebinding names that point at private
 *                              ranges are refused)
 *   safeFetchText(url, opts)   GET over http/https with a lookup hook that re-checks
 *                              every resolved address at connect time and pins the
 *                              connection to a checked address (no TOCTOU rebinding)
 */
"use strict";
const net = require("net");
const dns = require("dns");

function v4ToInt(ip) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
function inV4(ip, cidr) {
  const [base, bits] = cidr.split("/");
  const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}
const V4_BLOCKED = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];

/** Expand an IPv6 string (with optional embedded IPv4 / zone id) to 16 bytes, or null. */
function v6Bytes(ip) {
  let x = String(ip).toLowerCase().split("%")[0];
  if (!net.isIPv6(x)) return null;
  let tail = [];
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (m) {
    const o = m[2].split(".").map(Number);
    tail = [o[0], o[1], o[2], o[3]];
    x = m[1].endsWith("::") ? m[1] : m[1].slice(0, -1);
  }
  const [head, rest] = x.includes("::") ? x.split("::") : [x, null];
  const h = head ? head.split(":").filter((s) => s !== "") : [];
  const r = rest != null && rest !== "" ? rest.split(":").filter((s) => s !== "") : [];
  const groups = 8 - tail.length / 2;
  const fill = rest != null ? groups - h.length - r.length : 0;
  const all = [...h, ...Array(Math.max(0, fill)).fill("0"), ...r];
  if (all.length !== groups) return null;
  const out = [];
  for (const g of all) { const v = parseInt(g, 16); out.push((v >> 8) & 255, v & 255); }
  return [...out, ...tail];
}

function isPrivateIp(ip) {
  const s = String(ip || "").replace(/^\[|\]$/g, "");
  if (net.isIPv4(s)) return V4_BLOCKED.some((c) => inV4(s, c));
  const b = v6Bytes(s);
  if (!b) return false;
  const zero = (from, to) => b.slice(from, to).every((v) => v === 0);
  const v4 = () => b.slice(12, 16).join(".");
  if (zero(0, 16)) return true;                                     // ::
  if (zero(0, 15) && b[15] === 1) return true;                      // ::1
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateIp(v4()); // ::ffff:a.b.c.d (mapped)
  if (zero(0, 12)) return true;                                     // ::a.b.c.d (deprecated compat)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return isPrivateIp(v4()); // 64:ff9b::/96 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIp(b.slice(2, 6).join(".")); // 2002::/16 6to4
  if ((b[0] & 0xfe) === 0xfc) return true;                          // fc00::/7 ULA
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;         // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true;         // fec0::/10 site-local
  if (b[0] === 0xff) return true;                                   // multicast
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 docs
  if (b[0] === 0x01 && zero(1, 8)) return true;                     // 100::/64 discard
  return false;
}

const BLOCKED_NAMES = new Set(["localhost", "metadata", "metadata.google.internal", "metadata.goog", "instance-data", "instance-data.ec2.internal"]);
const BLOCKED_SUFFIX = [".localhost", ".internal", ".local", ".lan", ".home.arpa", ".intranet", ".corp"];

/** A private IPv4 written into the hostname (127.0.0.1.nip.io, 10-0-0-1.sslip.io, 0x7f000001.x). */
function embedsPrivateV4(host) {
  const re = /(?:^|[.-])(\d{1,3})[.-](\d{1,3})[.-](\d{1,3})[.-](\d{1,3})(?=$|[.-])/g;
  let m;
  while ((m = re.exec(host))) {
    const o = m.slice(1, 5).map(Number);
    if (o.every((n) => n <= 255) && isPrivateIp(o.join("."))) return true;
    re.lastIndex = m.index + 1;
  }
  const hex = /(?:^|\.)(?:0x)?([0-9a-f]{8})(?=\.|$)/.exec(host);
  if (hex) {
    const n = parseInt(hex[1], 16);
    if (isPrivateIp([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."))) return true;
  }
  return false;
}

function checkPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http and https urls");
  if (u.username || u.password) throw new Error("credentials in urls are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_NAMES.has(host) || BLOCKED_SUFFIX.some((s) => host.endsWith(s)) ||
      isPrivateIp(host) || (!net.isIP(host) && embedsPrivateV4(host))) {
    throw new Error("private or local addresses are blocked");
  }
  return u.toString();
}

function lookupAll(host, lookup) {
  return new Promise((resolve, reject) => {
    (lookup || dns.lookup)(host, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return reject(err);
      resolve(Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIPv6(addrs) ? 6 : 4 }]);
    });
  });
}

function assertAllPublic(addrs) {
  if (!addrs.length) throw new Error("host did not resolve");
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error("private or local addresses are blocked");
}

/** Literal checks, then resolve DNS and require every address to be public. */
async function assertPublicUrl(raw, opts) {
  const url = checkPublicUrl(raw);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return url;
  let addrs;
  try { addrs = await lookupAll(host, opts && opts.lookup); } catch { throw new Error("host did not resolve"); }
  assertAllPublic(addrs);
  return url;
}

/** lookup hook for http(s).request: checks every address, then connects to a checked one. */
function guardedLookup(baseLookup) {
  return (host, options, cb) => {
    if (typeof options === "function") { cb = options; options = {}; }
    lookupAll(host, baseLookup).then((addrs) => {
      assertAllPublic(addrs);
      if (options && options.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    }, (err) => cb(err)).catch((err) => cb(err));
  };
}

/** GET a public URL as text; never follows redirects; addresses checked at connect time. */
async function safeFetchText(raw, opts) {
  opts = opts || {};
  const url = await assertPublicUrl(raw, opts);
  const u = new URL(url);
  const mod = u.protocol === "https:" ? require("https") : require("http");
  const maxBytes = opts.maxBytes || 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, {
      method: "GET",
      headers: { "User-Agent": "gruda-agent", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
      lookup: guardedLookup(opts.lookup),
      timeout: opts.timeoutMs || 15000,
    }, (res) => {
      let size = 0; const chunks = [];
      res.on("data", (c) => { size += c.length; if (size > maxBytes) { req.destroy(new Error("response too large")); return; } chunks.push(c); });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8"), url }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

module.exports = { checkPublicUrl, assertPublicUrl, safeFetchText, guardedLookup, isPrivateIp, embedsPrivateV4, v6Bytes };
