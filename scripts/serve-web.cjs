// Serve the exported browser app only; never expose the checkout or .env files.
/* global __dirname */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../dist-web");
if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("No browser build found. Run npm run web first.");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const server = http.createServer((request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400).end("Invalid path");
    return;
  }
  const candidate = path.resolve(root, "." + pathname);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const file = [
    candidate,
    candidate + ".html",
    path.join(candidate, "index.html"),
  ].find((name) => {
    try {
      return fs.statSync(name).isFile();
    } catch {
      return false;
    }
  });
  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.setHeader(
    "Content-Type",
    types[path.extname(file)] ?? "application/octet-stream",
  );
  if (request.method === "HEAD") return response.end();
  const stream = fs.createReadStream(file);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
});
server.on("error", (error) => {
  console.error(`Could not start browser preview: ${error.message}`);
  process.exitCode = 1;
});
server.listen(8080, "localhost", () => {
  console.log("FORGE browser preview: http://localhost:8080");
  console.log("Keep this terminal open. Press Ctrl+C to stop.");
});
