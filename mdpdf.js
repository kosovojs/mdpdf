#!/usr/bin/env node
// mdpdf - dense 2-column A4 PDFs from markdown, via md-to-pdf's API.
const { parseArgs } = require("util");
const fs = require("fs");
const path = require("path");
const { mdToPdf } = require("md-to-pdf");

const HELP = `usage: mdpdf [options] [file-or-dir ...]

Converts markdown to dense, print-ready A4 PDFs. No args = every .md under cwd.

  -o, --out DIR      write output to DIR (default: beside the source file)
  -c, --columns N    text columns per page (default: 2)
  -s, --size PT      base font size in pt (default: 7)
  -j, --jobs N       parallel conversions (default: 4)
  -n, --newer        skip files whose PDF is already up to date
      --css FILE     extra stylesheet, applied after the built-in one
      --html         emit HTML instead of PDF
      --dry-run      list what would be converted, convert nothing
  -q, --quiet        only report failures
  -h, --help         this

examples:
  mdpdf                          every .md under cwd
  mdpdf docs -o ~/print -j 8     docs/ -> ~/print, 8 at a time
  mdpdf -c 1 -s 9 SPEC.md        single column, larger type
`;

let opts, targets;
try {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      columns: { type: "string", short: "c", default: "2" },
      size: { type: "string", short: "s", default: "7" },
      jobs: { type: "string", short: "j", default: "4" },
      newer: { type: "boolean", short: "n", default: false },
      css: { type: "string" },
      html: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  opts = parsed.values;
  targets = parsed.positionals;
} catch (e) {
  console.error(`mdpdf: ${e.message}\n\n${HELP}`);
  process.exit(2);
}

if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const num = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`mdpdf: --${name} must be a positive number, got "${v}"`);
    process.exit(2);
  }
  return n;
};
const columns = num(opts.columns, "columns");
const size = num(opts.size, "size");
const jobs = Math.max(1, Math.floor(num(opts.jobs, "jobs")));
const ext = opts.html ? ".html" : ".pdf";
const log = (...a) => opts.quiet || console.log(...a);

// Sizes are ratios of the base so -s scales the whole page coherently.
let css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap');
@page { size: A4; margin: 0; }
:root { --fs: ${size}pt; }
body {
  font-family: "IBM Plex Sans", sans-serif;
  font-size: var(--fs); line-height: 1.22; color: #111;
  max-width: none; columns: ${columns}; column-gap: 4mm; column-fill: auto; padding: 2mm;
}
h1 { font-size: calc(var(--fs) * 1.571); font-weight: 700; margin: 4pt 0 2pt; padding-bottom: 1pt; border-bottom: 1pt solid #333; page-break-after: avoid; column-span: all; }
h2 { font-size: calc(var(--fs) * 1.286); font-weight: 700; margin: 4pt 0 1pt; padding-bottom: 0.5pt; border-bottom: 0.5pt solid #999; page-break-after: avoid; column-span: all; }
h3 { font-size: calc(var(--fs) * 1.143); font-weight: 600; margin: 3pt 0 1pt; page-break-after: avoid; }
h4 { font-size: var(--fs); font-weight: 600; margin: 2pt 0 1pt; page-break-after: avoid; }
p { margin: 1.5pt 0; orphans: 2; widows: 2; }
ul, ol { margin: 1pt 0; padding-left: 10pt; }
li { margin: 0.3pt 0; }
p > strong:first-child { font-size: calc(var(--fs) * 1.071); }
li > em:first-child { font-size: calc(var(--fs) * 0.929); color: #444; }
pre, code { font-family: "IBM Plex Mono", monospace; font-size: calc(var(--fs) * 0.857); }
pre { background: #f5f5f5; padding: 2pt 3pt; margin: 1pt 0; border: 0.3pt solid #ddd; overflow-wrap: break-word; white-space: pre-wrap; }
code { background: #f0f0f0; padding: 0 1pt; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; font-size: calc(var(--fs) * 0.929); margin: 2pt 0; column-span: all; break-inside: auto; table-layout: auto; }
th, td { border: 0.3pt solid #ccc; padding: 1pt 2pt; text-align: left; vertical-align: top; overflow-wrap: break-word; word-break: normal; hyphens: auto; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
th { background: #f0f0f0; font-weight: 600; }
hr { border: none; border-top: 0.5pt solid #ccc; margin: 3pt 0; }
blockquote { margin: 1pt 0 1pt 6pt; padding-left: 4pt; border-left: 1.5pt solid #ddd; color: #333; font-size: calc(var(--fs) * 0.929); }
a { color: #111; text-decoration: none; }
`;
// --css is layered on top so it wins over the built-in styles above.
if (opts.css) css += "\n" + fs.readFileSync(path.resolve(opts.css), "utf8");

const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", ".git"]);

function findMarkdown(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      files.push(...findMarkdown(path.join(dir, e.name)));
    } else if (e.name.endsWith(".md")) {
      files.push(path.join(dir, e.name));
    }
  }
  return files;
}

let files = (targets.length ? targets : [process.cwd()]).flatMap((t) => {
  const full = path.resolve(t);
  try {
    return fs.statSync(full).isDirectory() ? findMarkdown(full).sort() : [full];
  } catch {
    console.error(`  ✗ ${t}: no such file or directory`);
    return [];
  }
});
files = [...new Set(files)];

const outFor = (f) =>
  opts.out
    ? path.join(path.resolve(opts.out), path.basename(f, ".md") + ext)
    : f.replace(/\.md$/, ext);

// Flattening nested trees into one --out dir can silently clobber; refuse instead.
if (opts.out) {
  const seen = new Map();
  for (const f of files) {
    const o = outFor(f);
    if (seen.has(o)) {
      console.error(`mdpdf: ${seen.get(o)} and ${f} both write to ${o}`);
      process.exit(1);
    }
    seen.set(o, f);
  }
}

const mtime = (p) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return -1;
  }
};
if (opts.newer) {
  const before = files.length;
  files = files.filter((f) => mtime(outFor(f)) < mtime(f));
  const skipped = before - files.length;
  if (skipped) log(`skipping ${skipped} up to date`);
  if (!files.length) {
    log("nothing to do");
    process.exit(0);
  }
}

if (!files.length) {
  console.error("nothing to print");
  process.exit(1);
}

if (opts["dry-run"]) {
  for (const f of files) console.log(`${path.relative(process.cwd(), f)} -> ${outFor(f)}`);
  process.exit(0);
}

if (opts.out) fs.mkdirSync(path.resolve(opts.out), { recursive: true });

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);

async function convert(f) {
  const r = path.relative(process.cwd(), f);
  const rel = r.length < f.length ? r : f; // ../../.. spam isn't a nicer name than the abs path
  try {
    await withTimeout(
      mdToPdf(
        { path: f },
        {
          dest: outFor(f),
          css,
          as_html: opts.html,
          pdf_options: opts.html
            ? undefined
            : { format: "A4", margin: { top: "0", bottom: "0", left: "0", right: "0" }, printBackground: true },
        }
      ),
      120_000
    );
    log(`  ✓ ${rel}`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${rel}: ${e.message}`);
    return false;
  }
}

(async () => {
  log(`${files.length} markdown file${files.length > 1 ? "s" : ""}\n`);
  const queue = files[Symbol.iterator]();
  let ok = 0;
  const worker = async () => {
    for (const f of queue) if (await convert(f)) ok++;
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  log(`\ndone: ${ok}/${files.length}`);
  process.exit(ok < files.length ? 1 : 0);
})();
