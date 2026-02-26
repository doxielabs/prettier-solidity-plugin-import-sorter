// SPDX-License-Identifier: GPL-3.0-or-later

"use strict";

const { sortImports } = require("./sort-imports");

// ── Prettier plugin API ───────────────────────────────────────────────────────
//
// Prettier plugins must export:
//   parsers  – how to turn source text into an AST
//   printers – how to turn an AST back into text
//   options  – custom option declarations
//
// Because we only need to reorder imports (a text-level transformation) we use
// a trivial "identity" AST so that the printer can simply return the transformed
// source without Prettier ever needing a real Solidity parser.

const options = {
  solidityFirstPartyScope: {
    type: "string",
    category: "Solidity",
    default: "@balancer-labs",
    description:
      "The npm scope (or package prefix) that identifies first-party / monorepo packages. " +
      "Imports under this scope are split into 'first-party interfaces' " +
      "(path contains /interfaces/) and 'first-party packages'. " +
      "Everything else is treated as third-party. " +
      "Example: '@my-org'",
  },
};

const parsers = {
  "solidity-import-sorter": {
    parse(text, _parsers, opts) {
      // Store the transformed text in the AST so the printer can emit it.
      const scope = opts.solidityFirstPartyScope ?? "@balancer-labs";
      return {
        type: "root",
        // Run the sort at parse time so the printer is trivial.
        body: sortImports(text, scope),
        // Required by Prettier
        start: 0,
        end: text.length,
      };
    },
    astFormat: "solidity-import-sorter-ast",
    locStart(node) {
      return node.start;
    },
    locEnd(node) {
      return node.end;
    },
  },
};

const printers = {
  "solidity-import-sorter-ast": {
    print(path) {
      return path.getValue().body;
    },
  },
};

// Tell Prettier which file extensions this plugin handles.
const languages = [
  {
    name: "Solidity",
    parsers: ["solidity-import-sorter"],
    extensions: [".sol"],
    vscodeLanguageIds: ["solidity"],
  },
];

module.exports = { languages, parsers, printers, options };
