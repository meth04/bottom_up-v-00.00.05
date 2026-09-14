// dev-server.js
//
// Tiny zero-dependency static file server, just so index.html can fetch()
// data/map.json (browsers block fetch() of local files over file://).
// T4: also portal-ready — gzip for text, long cache for hashed-immutable
// assets (js/css), no-cache for html/json, so `node scripts/dev-server.js`
// doubles as a prod preview server. Not part of the game itself.

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, urlPath);

  // Don't allow escaping the project root.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found: " + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    // T4: cache immutable code, never cache the shell or the data.
    const cache = ext === ".html" || ext === ".json"
      ? "no-cache"
      : "public, max-age=3600";
    const headers = { "Content-Type": type, "Cache-Control": cache };
    const accept = req.headers["accept-encoding"] || "";
    const compressible = /^(text\/|application\/(javascript|json))/.test(type);
    if (compressible && /\bgzip\b/.test(accept)) {
      headers["Content-Encoding"] = "gzip";
      res.writeHead(200, headers);
      zlib.gzip(data, (zipErr, zipped) => {
        if (zipErr) res.end(data);
        else res.end(zipped);
      });
      return;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
