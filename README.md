# mdpdf

Dense, print-ready A4 PDFs from markdown.

## Run without installing

```
bunx github:kosovojs/mdpdf [options] [file-or-dir ...]
bunx kosovojs/mdpdf [options] [file-or-dir ...]
```

## Install

```
bun add -g github:kosovojs/mdpdf
```

## Usage

```
usage: mdpdf [options] [file-or-dir ...]

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
```

## Examples

```
mdpdf                          # every .md under cwd
mdpdf docs -o ~/print -j 8     # docs/ -> ~/print, 8 at a time
mdpdf -c 1 -s 9 SPEC.md        # single column, larger type
mdpdf --css theme.css report.md
```
