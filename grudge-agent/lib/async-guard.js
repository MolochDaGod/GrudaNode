/**
 * Express 4 doesn't catch rejected promises from async handlers: the request
 * hangs and Node raises unhandledRejection (which crashes a plain process).
 *
 *   installAsyncGuard(app)   wraps every handler registered afterwards through
 *                            app.get/post/put/patch/delete/all/use so a throw or
 *                            rejection goes to next(err)
 *   errorHandler             final middleware: err → JSON 4xx/5xx, never a hang
 *   installProcessGuards()   logs unhandledRejection / uncaughtException instead of
 *                            letting one bad request take the server down
 */
"use strict";

function wrap(fn) {
  // Leave error middleware, sub-apps and routers (they have .handle/.stack) as they are.
  if (typeof fn !== "function" || fn.length === 4 || fn.__grudaWrapped || fn.handle || fn.stack) return fn;
  const w = function (req, res, next) {
    try {
      const r = fn.call(this, req, res, next);
      if (r && typeof r.then === "function") r.catch(next);
      return r;
    } catch (err) { next(err); }
  };
  w.__grudaWrapped = true;
  Object.defineProperty(w, "name", { value: fn.name || "handler" });
  return w;
}

function wrapArgs(args) {
  return args.map((a) => (Array.isArray(a) ? wrapArgs(a) : wrap(a)));
}

function installAsyncGuard(app) {
  for (const m of ["get", "post", "put", "patch", "delete", "all", "use"]) {
    const orig = app[m].bind(app);
    app[m] = function (...args) {
      // app.get("setting") with one string arg reads a setting; don't touch it.
      if (m === "get" && args.length === 1 && typeof args[0] === "string") return orig(...args);
      return orig(...wrapArgs(args));
    };
  }
  return app;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = Number(err && (err.status || err.statusCode)) || (err && err.code === "EPATH" ? 400 : 500);
  const code = status >= 400 && status < 600 ? status : 500;
  if (code >= 500) console.error("[gruda-agent] request failed:", req.method, req.originalUrl, err && err.message);
  if (res.headersSent) { try { res.end(); } catch {} return; }
  res.status(code).json({ error: code >= 500 ? "internal error" : (err && err.expose !== false && err.message) || "bad request" });
}

let installed = false;
function installProcessGuards(log) {
  if (installed) return;
  installed = true;
  const out = log || ((kind, e) => console.error(`[gruda-agent] ${kind}:`, e && e.stack ? e.stack : e));
  process.on("unhandledRejection", (reason) => out("unhandledRejection", reason));
  process.on("uncaughtException", (err) => out("uncaughtException", err));
}

module.exports = { installAsyncGuard, errorHandler, installProcessGuards, wrap };
