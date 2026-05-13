import { createReadStream, existsSync } from 'fs';
import { createServer } from 'http';
import { dirname, extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requested));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`TSX Spiff dashboard running at http://localhost:${port}`);
});
