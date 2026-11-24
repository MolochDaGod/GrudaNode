/**
 * Adds the signed-in user's token to this app's own /api requests, so the
 * server can verify who is calling (Puter session, or a Grudge ID token).
 * Only same-origin /api/ URLs get the header; other sites never see it.
 */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.fetch || window.__grudaApiAuth) return;
  window.__grudaApiAuth = true;
  var nativeFetch = window.fetch.bind(window);

  function currentToken() {
    try { if (window.puter && window.puter.authToken) return window.puter.authToken; } catch (e) {}
    try { return localStorage.getItem("gruda.grudge_token") || localStorage.getItem("puter.auth.token") || ""; } catch (e) { return ""; }
  }

  function isOwnApi(input) {
    try {
      var u = new URL(typeof input === "string" ? input : (input && input.url) || "", window.location.href);
      return u.origin === window.location.origin && u.pathname.indexOf("/api/") === 0;
    } catch (e) { return false; }
  }

  window.fetch = function (input, init) {
    if (!isOwnApi(input)) return nativeFetch(input, init);
    var token = currentToken();
    if (!token) return nativeFetch(input, init);
    init = init || {};
    var headers = new Headers(init.headers || (input && input.headers) || {});
    if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);
    return nativeFetch(input, Object.assign({}, init, { headers: headers }));
  };
})();
