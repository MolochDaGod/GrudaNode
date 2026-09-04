/**
 * Web VS Code launchers for Legion IDE tab.
 * Monaco stays in-pane. vscode.dev / github.dev open as tabs (CSP).
 * OpenVSCode Server is the self-host path (VPS) — not a Cloudflare Worker.
 */
(function () {
  const REPOS = [
    { org: 'MolochDaGod', name: 'ObjectStore', note: 'info.* definitions' },
    { org: 'MolochDaGod', name: 'gruda-build', note: 'GRUDA harness' },
    { org: 'MolochDaGod', name: 'GrudaNode', note: 'this Legion UI' },
    { org: 'MolochDaGod', name: 'GrudachainCode', note: 'coder.grudge-studio.com' },
    { org: 'MolochDaGod', name: 'grudge-ai-hub', note: 'ai.grudge-studio.com API' },
  ];

  function vscodeGithub(org, name) {
    return 'https://vscode.dev/github/' + org + '/' + name;
  }
  function githubDev(org, name) {
    return 'https://github.dev/' + org + '/' + name;
  }
  function githubRepo(org, name) {
    return 'https://github.com/' + org + '/' + name;
  }

  function openTab(url) {
    window.open(url, '_blank', 'noopener');
  }

  function render() {
    const bar = document.getElementById('vsc-web-bar');
    if (!bar) return;
    const ov = localStorage.getItem('grudaOpenvscode') || '';
    bar.innerHTML =
      '<div class="vsc-row">' +
      '<span class="vsc-label">Web VS Code</span>' +
      '<button type="button" class="int-btn" data-vsc="monaco">Monaco (this tab)</button>' +
      '<button type="button" class="int-btn" data-vsc="coder">Coder IDE</button>' +
      (ov
        ? '<button type="button" class="int-btn" data-vsc="openvscode">OpenVSCode (VPS)</button>'
        : '<button type="button" class="int-btn" data-vsc="setov">Set OpenVSCode URL</button>') +
      '</div>' +
      '<div class="vsc-row">' +
      '<span class="vsc-label">GitHub</span>' +
      REPOS.map(function (r) {
        return (
          '<button type="button" class="int-btn" data-gh="' +
          r.org +
          '/' +
          r.name +
          '" title="' +
          r.note +
          '">' +
          r.name +
          '</button>'
        );
      }).join('') +
      '</div>' +
      '<p class="vsc-hint">vscode.dev / github.dev cannot iframe from Legion (CSP) — they open a tab. Monaco stays here. OpenVSCode Server (gitpod-io) is full VS Code + terminal on a machine; Workers cannot host it.</p>';

    bar.onclick = function (e) {
      const gh = e.target.closest('[data-gh]');
      if (gh) {
        const id = gh.getAttribute('data-gh');
        const parts = id.split('/');
        openTab(vscodeGithub(parts[0], parts[1]));
        return;
      }
      const act = e.target.getAttribute('data-vsc');
      if (act === 'monaco') {
        document.getElementById('monaco-container')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (act === 'coder') {
        openTab('https://coder.grudge-studio.com');
        return;
      }
      if (act === 'openvscode') {
        openTab(ov);
        return;
      }
      if (act === 'setov') {
        const u = prompt('OpenVSCode Server origin (e.g. https://code.your-vps:3000)', ov || 'http://127.0.0.1:3000');
        if (u) {
          localStorage.setItem('grudaOpenvscode', u.replace(/\/$/, ''));
          render();
        }
      }
    };
  }

  window.GrudaVscWeb = { render: render, vscodeGithub: vscodeGithub, githubDev: githubDev, githubRepo: githubRepo, REPOS: REPOS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
