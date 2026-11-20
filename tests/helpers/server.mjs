// Tiny static server for the test website in tests/fixtures/site.
// Replaces {{ORIGIN}} in files with the server's own address, and adds a few
// special routes the audits must catch (redirect chain, 404s).

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../fixtures/site/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain' };

export function startSite() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      const redirects = { '/chain': '/chain2', '/chain2': '/about.html', '/old-home': '/' };
      if (redirects[url.pathname]) {
        res.writeHead(301, { location: redirects[url.pathname] });
        return res.end();
      }
      let file = normalize(join(SITE, url.pathname === '/' ? 'index.html' : url.pathname));
      if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/html' });
        return res.end('<!doctype html><title>Not found</title><h1>Not found</h1>');
      }
      const type = TYPES[extname(file)];
      if (!type) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        return res.end('');
      }
      const body = readFileSync(file, 'utf8').replaceAll('{{ORIGIN}}', origin);
      res.writeHead(200, { 'content-type': type });
      if (req.method === 'HEAD') return res.end();
      return res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
