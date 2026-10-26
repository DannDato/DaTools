/* Compatibilidad con servidores estáticos locales sin reglas try_files. */
(() => {
  'use strict';
  const hostname = location.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = hostname.split('.').map(Number);
  const privateIpv4 = ipv4.length === 4 && ipv4.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (ipv4[0] === 127 || ipv4[0] === 10 || (ipv4[0] === 192 && ipv4[1] === 168) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || hostname === '0.0.0.0');
  const fileMode = location.protocol === 'file:';
  const local = fileMode || hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || hostname === '::1' || privateIpv4;
  if (!local) return;

  const toolRoute = /\/(submotion\/submotion|animotion\/animotion|toviu\/toviu|imanage\/imanage|teleprompter\/teleprompter)$/;
  for (const link of document.querySelectorAll('a[href]')) {
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#') || link.hasAttribute('download')) continue;
    const url = new URL(raw, location.href);
    if (url.protocol !== location.protocol || url.host !== location.host) continue;
    if (toolRoute.test(url.pathname)) url.pathname += '.html';
    else if (fileMode && url.pathname.endsWith('/')) url.pathname += 'index.html';
    else continue;
    link.href = url.href;
  }
})();
