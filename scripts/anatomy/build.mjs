// Builds the FORGE anatomy atlas (Phase 7.2C-3A) from the CC BY-SA source
// drawing: per view a flat base, a shading overlay and cropped highlight
// images for each named muscle region, plus src/anatomy/atlas.generated.ts.
//
//   node scripts/anatomy/build.mjs
//
// Rendering runs in the local Microsoft Edge (headless), so the output
// matches the browser-rendered prototypes. Licence: assets/anatomy/LICENSE.md.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "assets/anatomy/source/muscles-front-and-back.svg");

// Named regions: indices into the source's <path> elements (document
// order). Mirrored halves are <use> copies and light up with their original.
// Identified by hit-testing and a colour-coded check render (7.2C-3A report).
export const REGIONS = {
  front: {
    "pectoralis-major": [80],
    deltoid: [77],
    biceps: [84],
    trapezius: [70],
    "rectus-abdominis": [89, 90, 91, 92],
    obliques: [69],
    quadriceps: [26, 23, 21],
    adductors: [24],
    "tibialis-anterior": [15],
  },
  back: {
    trapezius: [163],
    deltoid: [152],
    infraspinatus: [135],
    "teres-major": [133],
    "latissimus-dorsi": [136],
    triceps: [149, 150],
    "erector-spinae": [137],
    obliques: [129],
    "gluteus-medius": [130],
    // The source shape continues down the outer thigh: keep it above the
    // gluteal fold (source units).
    "gluteus-maximus": { paths: [128], clipMaxY: 187 },
    hamstrings: [119, 120, 121, 122, 114, 115],
    gastrocnemius: [167, 168],
    soleus: [112, 113],
  },
};

// Palette (dark REFORGE atlas). Neutral muscle is a touch lighter than the
// approved prototypes (#353940) for contrast, as requested in review.
const PALETTE = {
  muscle: "#3B4047",
  skin: "#1B1D20",
  bone: "#17191C",
  tendon: "#141619",
  line: "#0A0B0D",
  primaryTop: "#FF8A3A",
  primaryBottom: "#D24A14",
  glow: "#F47522",
  secondaryTop: "#7A3A1A",
  secondaryBottom: "#55260F",
  secondaryEdge: "#C0662C",
};
// Figure height in pixels (3× a ~300 pt display height).
const HEIGHT = 900;
// Front and back figures are side by side in the source; split between them.
const SPLIT_X = 220;

const edge = [
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((p) => p && existsSync(p));
if (!edge) throw new Error("Microsoft Edge is required to render the atlas.");

const svg = readFileSync(source, "utf8").replace(/<\?xml[^>]*\?>/, "");

const page = `<!doctype html><html><body>
<div id="src" style="position:absolute;left:0;top:0;width:1442px">${svg}</div>
<pre id="out"></pre>
<script>
const REGIONS = ${JSON.stringify(REGIONS)};
const P = ${JSON.stringify(PALETTE)};
const HEIGHT = ${HEIGHT}, SPLIT_X = ${SPLIT_X};
const NS = "http://www.w3.org/2000/svg";
const live = document.querySelector("#src svg");
live.setAttribute("width", "1442px");
live.removeAttribute("height");
const [vx, vy, vw, vh] = live.getAttribute("viewBox").split(/[ ,]+/).map(Number);
const unit = vw / live.getBoundingClientRect().width;

const rgb = (s) => { const m = s && s.match(/\\d+(\\.\\d+)?/g); return m ? m.slice(0, 3).map(Number) : null; };
function role(c) {
  if (!c) return null;
  const [r, g, b] = c;
  if (r > 200 && g < 200 && r - g > 45) return "muscle";
  if (r > 240 && g > 220 && b < 215) return "skin";
  if (Math.abs(r - g) < 12 && r > 200 && b < r - 8) return "bone";
  if (r > 195 && g > 195 && b > 195) return "tendon";
  if (r < 120 && g < 120 && b < 120) return "line";
  return "muscle";
}
// Classify every path once, from the live document.
const livePaths = [...live.querySelectorAll("path")];
const info = livePaths.map((p) => {
  const cs = getComputedStyle(p);
  const fill = cs.fill;
  return {
    line: fill === "none",
    gradient: fill.startsWith("url"),
    role: fill.startsWith("url") ? "muscle" : fill === "none" ? "line" : role(rgb(fill)),
    stroke: cs.stroke !== "none",
  };
});
const stopRoles = [...live.querySelectorAll("stop")].map((s) => role(rgb(getComputedStyle(s).stopColor)));

// Crop boxes (source units) for each figure from the rendered geometry.
function cropFor(view) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const base = live.getBoundingClientRect();
  for (const el of live.querySelectorAll("path, use")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cx = vx + ((r.left + r.right) / 2 - base.left) * unit;
    if ((view === "front") !== (cx < SPLIT_X)) continue;
    x0 = Math.min(x0, vx + (r.left - base.left) * unit);
    x1 = Math.max(x1, vx + (r.right - base.left) * unit);
    y0 = Math.min(y0, vy + (r.top - base.top) * unit);
    y1 = Math.max(y1, vy + (r.bottom - base.top) * unit);
  }
  const pad = 1.5;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

const FILTERS = \`
<filter id="sculpt" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
 <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>
 <feSpecularLighting in="b" surfaceScale="3" specularConstant=".7" specularExponent="14" lighting-color="#ffffff" result="s"><feDistantLight azimuth="250" elevation="38"/></feSpecularLighting>
 <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
 <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="e"/>
 <feComposite in="SourceAlpha" in2="e" operator="arithmetic" k2="1" k3="-1" result="edge"/>
 <feFlood flood-color="#000" flood-opacity=".55"/><feComposite in2="edge" operator="in" result="shade"/>
 <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".22" result="lit"/>
 <feMerge><feMergeNode in="lit"/><feMergeNode in="shade"/></feMerge>
</filter>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>
<linearGradient id="gPrimary" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="\${P.primaryTop}"/><stop offset="1" stop-color="\${P.primaryBottom}"/></linearGradient>
<linearGradient id="gSecondary" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="\${P.secondaryTop}"/><stop offset="1" stop-color="\${P.secondaryBottom}"/></linearGradient>\`;

// A styled copy of the source, cropped to one figure.
function variant(crop, W, H, style) {
  const doc = new DOMParser().parseFromString(${JSON.stringify(svg)}, "image/svg+xml");
  const s = doc.documentElement;
  s.setAttribute("viewBox", [crop.x, crop.y, crop.w, crop.h].join(" "));
  s.setAttribute("width", W);
  s.setAttribute("height", H);
  let defs = s.querySelector("defs");
  if (!defs) { defs = doc.createElementNS(NS, "defs"); s.insertBefore(defs, s.firstChild); }
  defs.insertAdjacentHTML("beforeend", FILTERS);
  [...s.querySelectorAll("stop")].forEach((st, i) => {
    const r = stopRoles[i];
    if (r && P[r]) { st.style.stopColor = P[r]; st.setAttribute("stop-color", P[r]); }
  });
  const paths = [...s.querySelectorAll("path")];
  // Clip and mask geometry is never restyled or hidden: it shapes what is
  // drawn, it is not drawn itself.
  paths.forEach((p, i) => {
    if (p.closest("clipPath, mask")) return;
    style(p, i, info[i], doc, defs);
  });
  return new XMLSerializer().serializeToString(s);
}
function flat(p, i, f) {
  p.removeAttribute("filter");
  p.style.strokeWidth = "0"; p.style.stroke = "none";
  if (f.line) { p.style.display = "none"; return; }
  if (!f.gradient) p.style.fill = P[f.role] || P.muscle;
  p.style.fillOpacity = "1";
}
function lit(p, i, f) {
  p.style.fillOpacity = "1";
  if (f.line) { p.style.stroke = "#000"; p.style.strokeOpacity = ".55"; return; }
  if (!f.gradient) p.style.fill = P[f.role] || P.muscle;
  if (f.stroke) { p.style.stroke = f.role === "muscle" ? "#07080A" : "#0E0F11"; p.style.strokeOpacity = ".9"; }
  if (f.role === "muscle") p.setAttribute("filter", "url(#sculpt)");
}
const draw = (svgText, W, H) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(img, 0, 0, W, H); ok(c); };
  img.onerror = () => fail(new Error("render failed"));
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
});
const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height);

// Shading overlay: what lighting and lines add to the flat figure, as white
// (lighter) or black (darker) with alpha, so it applies over any colour.
function overlay(L, F) {
  const a = pixels(L), b = pixels(F), out = new ImageData(L.width, L.height);
  for (let i = 0; i < a.data.length; i += 4) {
    if (!b.data[i + 3]) continue;
    const lum = (d) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const l = lum(a.data), f = lum(b.data), diff = l - f;
    if (Math.abs(diff) < 0.004) continue;
    const alpha = diff > 0 ? diff / (1 - f) : -diff / Math.max(f, 0.01);
    const v = diff > 0 ? 255 : 0;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = Math.round(Math.min(1, alpha) * 255 * (b.data[i + 3] / 255));
  }
  const c = document.createElement("canvas"); c.width = L.width; c.height = L.height;
  c.getContext("2d").putImageData(out, 0, 0);
  return c;
}
function maskFrom(M) {
  const d = pixels(M);
  for (let i = 0; i < d.data.length; i += 4) {
    const a = d.data[i] * (d.data[i + 3] / 255);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a;
  }
  const c = document.createElement("canvas"); c.width = M.width; c.height = M.height;
  c.getContext("2d").putImageData(d, 0, 0); return c;
}
function crop(c) {
  const d = pixels(c);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
    if (d.data[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement("canvas");
  out.width = w; out.height = h; out.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, w, h);
  return { x: x0, y: y0, w, h, data: out.toDataURL("image/png") };
}

async function build() {
  const result = {};
  for (const view of ["front", "back"]) {
    const box = cropFor(view);
    const W = Math.round((box.w / box.h) * HEIGHT), H = HEIGHT;
    const F = await draw(variant(box, W, H, flat), W, H);
    const L = await draw(variant(box, W, H, lit), W, H);
    const out = { width: W, height: H, crop: box, base: F.toDataURL("image/png"), shade: overlay(L, F).toDataURL("image/png"), regions: {} };
    for (const [id, spec] of Object.entries(REGIONS[view])) {
      const ids = new Set(Array.isArray(spec) ? spec : spec.paths);
      const clip = Array.isArray(spec) ? undefined : spec.clipMaxY;
      const clipDef = (doc, defs) => {
        if (clip === undefined || defs.querySelector("#rclip")) return;
        defs.insertAdjacentHTML("beforeend", '<clipPath id="rclip" clipPathUnits="userSpaceOnUse"><rect x="-9999" y="-9999" width="99999" height="' + (9999 + clip) + '"/></clipPath>');
      };
      // The region clip is in source units; paths may carry transforms, so
      // it is applied to the outermost <svg> group instead (see below).
      const mark = (p, i, f, doc, defs) => {
        clipDef(doc, defs);
        p.removeAttribute("filter"); p.style.stroke = "none";
        if (f.line) { p.style.display = "none"; return; }
        p.style.fillOpacity = "1";
        p.style.fill = ids.has(i) ? "#fff" : "#000";
      };
      const paint = (fill, extra) => (p, i, f, doc, defs) => {
        clipDef(doc, defs);
        p.removeAttribute("filter");
        if (f.line || !ids.has(i)) { p.style.display = "none"; return; }
        p.style.fill = fill; p.style.fillOpacity = "1"; p.style.stroke = "none";
        extra && extra(p);
      };
      const clipped = (text) => clip === undefined ? text :
        text.replace(/(<svg[^>]*>)/, '$1<g clip-path="url(#rclip)">').replace(/<\\/svg>\\s*$/, "</g></svg>");
      const M = maskFrom(await draw(clipped(variant(box, W, H, mark)), W, H));
      const role = async (fill, extra, glow) => {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d");
        if (glow) {
          // A halo outside the silhouette only: inside the body, later
          // muscles cover the glow (as in the approved prototypes).
          const h = document.createElement("canvas"); h.width = W; h.height = H;
          const hg = h.getContext("2d");
          hg.drawImage(await draw(clipped(variant(box, W, H, paint(P.glow, (p) => p.setAttribute("filter", "url(#glow)")))), W, H), 0, 0);
          hg.globalCompositeOperation = "destination-out";
          hg.drawImage(F, 0, 0);
          g.globalAlpha = 0.55;
          g.drawImage(h, 0, 0);
          g.globalAlpha = 1;
        }
        const fillC = await draw(clipped(variant(box, W, H, paint(fill, extra))), W, H);
        const t = document.createElement("canvas"); t.width = W; t.height = H;
        const tg = t.getContext("2d");
        tg.drawImage(fillC, 0, 0);
        tg.globalCompositeOperation = "destination-in";
        tg.drawImage(M, 0, 0);
        g.drawImage(t, 0, 0);
        const cropped = crop(c);
        if (!cropped) {
          const count = (k) => { const d = pixels(k); let n = 0; for (let j = 3; j < d.data.length; j += 4) if (d.data[j] > 2) n++; return n; };
          throw new Error(view + "." + id + " empty: mask " + count(M) + ", fill " + count(fillC));
        }
        return cropped;
      };
      out.regions[id] = {
        primary: await role("url(#gPrimary)", undefined, true),
        secondary: await role("url(#gSecondary)", (p) => { p.style.stroke = P.secondaryEdge; p.style.strokeWidth = ".35"; p.style.strokeOpacity = ".9"; }, false),
      };
    }
    result[view] = out;
  }
  document.getElementById("out").textContent = JSON.stringify(result);
  document.title = "done";
}
build().catch((e) => { document.getElementById("out").textContent = "ERROR " + e.message; document.title = "done"; });
</script></body></html>`;

const work = join(tmpdir(), `forge-atlas-${process.pid}`);
mkdirSync(work, { recursive: true });
const html = join(work, "atlas.html");
writeFileSync(html, page);
const dom = execFileSync(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--virtual-time-budget=120000",
    "--window-size=1600,1600",
    "--dump-dom",
    pathToFileURL(html).href,
  ],
  { encoding: "utf8", maxBuffer: 1 << 30, timeout: 600000 },
);
rmSync(work, { recursive: true, force: true });
const raw = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1] ?? "";
const text = raw
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");
if (!text || text.startsWith("ERROR"))
  throw new Error(`Atlas render failed: ${text || "no output"}`);
const atlas = JSON.parse(text);

// Write images and the generated module.
const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const lines = [
  "// GENERATED by scripts/anatomy/build.mjs — do not edit.",
  "// Anatomy atlas images: CC BY-SA 4.0, see assets/anatomy/LICENSE.md.",
  'import type { AtlasView } from "./types";',
  "",
];
const views = [];
for (const view of ["front", "back"]) {
  const v = atlas[view];
  const dir = join(root, "assets/anatomy", view);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "base.png"), png(v.base));
  writeFileSync(join(dir, "shade.png"), png(v.shade));
  const regions = [];
  for (const [id, roles] of Object.entries(v.regions)) {
    const parts = [];
    for (const r of ["primary", "secondary"]) {
      const img = roles[r];
      if (!img) throw new Error(`${view}.${id} rendered empty`);
      writeFileSync(join(dir, `${id}.${r}.png`), png(img.data));
      parts.push(
        `${r}: { x: ${img.x}, y: ${img.y}, width: ${img.w}, height: ${img.h}, source: require("../../assets/anatomy/${view}/${id}.${r}.png") }`,
      );
    }
    regions.push(`    "${id}": { ${parts.join(", ")} },`);
  }
  views.push(
    `export const ${view}: AtlasView = {\n  width: ${v.width},\n  height: ${v.height},\n  base: require("../../assets/anatomy/${view}/base.png"),\n  shade: require("../../assets/anatomy/${view}/shade.png"),\n  regions: {\n${regions.join("\n")}\n  },\n};`,
  );
}
const target = join(root, "src/anatomy/atlas.generated.ts");
// The repository's own formatter, so the generated module passes format:check.
const prettier = await import("prettier");
writeFileSync(
  target,
  await prettier.format(`${lines.join("\n")}${views.join("\n\n")}\n`, {
    ...(await prettier.resolveConfig(target)),
    filepath: target,
  }),
);
console.log(
  `Atlas: front ${atlas.front.width}×${atlas.front.height}, back ${atlas.back.width}×${atlas.back.height}; regions ${Object.keys(atlas.front.regions).length} + ${Object.keys(atlas.back.regions).length}`,
);
