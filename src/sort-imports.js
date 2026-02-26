"use strict";

/**
 * Extracts the quoted path from an import statement (single- or multi-line).
 * Always uses the LAST quoted string in the statement — that is always the
 * module path, even when symbol names appear on earlier lines.
 *
 * Handles:
 *   import "path";
 *   import { Foo } from "path";
 *   import {\n    Foo,\n    Bar\n} from "path";
 */
function extractPath(importText) {
  const matches = [...importText.matchAll(/["']([^"']+)["']/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

/**
 * Returns true if the import binds names (specific import), false if it is a
 * bare side-effect import like:  import "path";
 *
 * Specific forms:
 *   import { Foo } from "path";
 *   import { Foo, Bar } from "path";
 *   import * as Foo from "path";
 *   import Foo from "path";
 *
 * Non-specific (bare):
 *   import "path";
 *   import '@scope/pkg/GlobalTypes.sol';
 */
function isSpecificImport(importText) {
  // Strip leading whitespace and the "import" keyword.
  const body = importText.replace(/^\s*import\s+/, "");
  // If what immediately follows "import " is a quote, it's bare.
  return !/^["']/.test(body.trimStart());
}

/**
 * Classify an import path into one of four groups.
 *
 * Group 1 – Third-party: anything that is not first-party, not relative
 * Group 2 – First-party interfaces: starts with firstPartyScope AND a path
 *            segment contains "interfaces"
 * Group 3 – First-party packages: starts with firstPartyScope, no interfaces segment
 * Group 4 – Relative: starts with ./ or ../  (interfaces or not — stays here)
 *
 * @param {string} importPath
 * @param {string} firstPartyScope  e.g. "@balancer-labs"
 * @returns {1|2|3|4}
 */
function classifyImport(importPath, firstPartyScope) {
  const scope = firstPartyScope.endsWith("/")
    ? firstPartyScope
    : firstPartyScope + "/";

  // Relative imports always stay in group 4, regardless of filename.
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return 4;
  }

  if (importPath.startsWith(scope)) {
    // Group 2 if any slash-delimited segment contains the word "interfaces"
    // (covers package names like v3-interfaces AND directory segments /interfaces/)
    const hasInterfacesSegment = importPath.split("/").some((s) => s.includes("interfaces"));
    return hasInterfacesSegment ? 2 : 3;
  }

  return 1;
}

/**
 * Sort comparator (three-level):
 *   1. Specific imports before bare/non-specific imports.
 *   2. Descending path length.
 *   3. Ascending alphabetical on ties.
 */
function bySpecificThenDescendingLength(a, b) {
  // Specific (true) sorts before non-specific (false).
  if (a.specific !== b.specific) return a.specific ? -1 : 1;
  const diff = b.path.length - a.path.length;
  return diff !== 0 ? diff : a.path.localeCompare(b.path);
}

/**
 * A "chunk" is one import statement, possibly preceded by attached comments.
 * Multi-line imports (curly-brace named imports spanning several lines) are
 * collected into a single chunk.
 *
 * @typedef {{ raw: string, path: string, specific: boolean }} Chunk
 */

/**
 * Parse raw source into three regions:
 *   - header:  everything before the imports block
 *   - chunks:  each import (+ any directly-preceding comment lines) as a unit
 *   - footer:  everything after the last import
 *
 * @param {string} source
 * @returns {{ header: string, chunks: Chunk[], footer: string }}
 */
function parseRegions(source) {
  const lines = source.split("\n");

  // ── locate the first and last import lines ───────────────────────────────
  let firstImportLine = -1;
  let lastImportLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("import")) {
      if (firstImportLine === -1) firstImportLine = i;
      let closingLine = i;
      while (closingLine < lines.length && !lines[closingLine].includes(";")) {
        closingLine++;
      }
      if (closingLine > lastImportLine) lastImportLine = closingLine;
      i = closingLine;
    }
  }

  // No imports found — return unchanged.
  if (firstImportLine === -1) {
    return { header: source, chunks: [], footer: "" };
  }

  // Walk backwards from firstImportLine to include comment lines directly
  // preceding the first import (with no blank-line gap).
  let regionStart = firstImportLine;
  for (let i = firstImportLine - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === "") break;
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) {
      regionStart = i;
    } else {
      break;
    }
  }

  const header = lines.slice(0, regionStart).join("\n");
  const footer = lines.slice(lastImportLine + 1).join("\n");
  const importRegionLines = lines.slice(regionStart, lastImportLine + 1);

  // ── parse chunks ──────────────────────────────────────────────────────────
  const chunks = [];
  let pendingComments = [];
  let i = 0;

  while (i < importRegionLines.length) {
    const trimmed = importRegionLines[i].trim();

    if (trimmed === "") {
      pendingComments = [];
      i++;
      continue;
    }

    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      pendingComments.push(importRegionLines[i]);
      i++;
      continue;
    }

    if (trimmed.startsWith("import")) {
      const importLines = [];
      while (i < importRegionLines.length) {
        importLines.push(importRegionLines[i]);
        if (importRegionLines[i].includes(";")) {
          i++;
          break;
        }
        i++;
      }
      const importText = importLines.join("\n");
      const path = extractPath(importText);
      if (path !== null) {
        const raw = [...pendingComments, ...importLines].join("\n");
        const specific = isSpecificImport(importText);
        chunks.push({ raw, path, specific });
      }
      pendingComments = [];
      continue;
    }

    i++;
  }

  return { header, chunks, footer };
}

/**
 * Deduplicate chunks by path: keep only the first occurrence of each path.
 *
 * @param {Chunk[]} chunks
 * @returns {Chunk[]}
 */
function deduplicate(chunks) {
  const seen = new Set();
  return chunks.filter(({ path }) => {
    if (seen.has(path)) return false;
    seen.add(path);
    return true;
  });
}

/**
 * Sort and reconstruct the imports block from a list of chunks.
 *
 * @param {Chunk[]} chunks
 * @param {string}  firstPartyScope
 * @returns {string}  the sorted imports block (no leading/trailing newline)
 */
function buildImportsBlock(chunks, firstPartyScope) {
  const groups = { 1: [], 2: [], 3: [], 4: [] };
  for (const chunk of chunks) {
    const g = classifyImport(chunk.path, firstPartyScope);
    groups[g].push(chunk);
  }

  for (const g of [1, 2, 3, 4]) {
    groups[g].sort(bySpecificThenDescendingLength);
  }

  return [1, 2, 3, 4]
    .filter((g) => groups[g].length > 0)
    .map((g) => groups[g].map((c) => c.raw).join("\n"))
    .join("\n\n");
}

/**
 * Main entry point.
 *
 * @param {string} source
 * @param {string} firstPartyScope  e.g. "@balancer-labs"
 * @returns {string}
 */
function sortImports(source, firstPartyScope = "@balancer-labs") {
  const { header, chunks, footer } = parseRegions(source);

  if (chunks.length === 0) return source;

  const deduped = deduplicate(chunks);
  const importsBlock = buildImportsBlock(deduped, firstPartyScope);

  const trimmedHeader = header.trimEnd();
  const trimmedFooter = footer.trimStart();

  let result = trimmedHeader + "\n\n" + importsBlock;
  if (trimmedFooter.length > 0) {
    result += "\n\n" + trimmedFooter;
  }

  if (source.endsWith("\n") && !result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

module.exports = { sortImports, classifyImport, extractPath, deduplicate, isSpecificImport };