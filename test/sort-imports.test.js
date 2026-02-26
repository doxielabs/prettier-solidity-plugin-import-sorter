"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  sortImports,
  classifyImport,
  extractPath,
  deduplicate,
  ImportGroup,
} = require("../src/sort-imports");

// ─────────────────────────────────────────────────────────────────────────────
// Unit: extractPath
// ─────────────────────────────────────────────────────────────────────────────
describe("extractPath", () => {
  it("extracts double-quoted path from a bare import", () => {
    assert.equal(
      extractPath('import "@openzeppelin/contracts/access/Ownable.sol";'),
      "@openzeppelin/contracts/access/Ownable.sol",
    );
  });

  it("extracts single-quoted path", () => {
    assert.equal(
      extractPath("import '../utils/Math.sol';"),
      "../utils/Math.sol",
    );
  });

  it("extracts path from a named import", () => {
    assert.equal(
      extractPath(
        'import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";',
      ),
      "@openzeppelin/contracts/access/Ownable.sol",
    );
  });

  it("returns null when no path is found", () => {
    assert.equal(extractPath("pragma solidity ^0.8.0;"), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit: classifyImport
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyImport", () => {
  const scope = "@balancer-labs";

  it("classifies third-party @openzeppelin as EXTERNAL_DEPENDENCIES", () => {
    assert.equal(
      classifyImport("@openzeppelin/contracts/access/Ownable.sol", scope),
      ImportGroup.EXTERNAL_DEPENDENCIES,
    );
  });

  it("classifies third-party @chainlink as EXTERNAL_DEPENDENCIES", () => {
    assert.equal(
      classifyImport(
        "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol",
        scope,
      ),
      ImportGroup.EXTERNAL_DEPENDENCIES,
    );
  });

  it("classifies @balancer-labs path with /interfaces/ as FIRST_PARTY_INTERFACES", () => {
    assert.equal(
      classifyImport(
        "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol",
        scope,
      ),
      ImportGroup.FIRST_PARTY_INTERFACES,
    );
  });

  it("classifies @balancer-labs path without /interfaces/ as FIRST_PARTY_PACKAGES", () => {
    assert.equal(
      classifyImport(
        "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol",
        scope,
      ),
      ImportGroup.FIRST_PARTY_PACKAGES,
    );
  });

  it("classifies ./ relative import as LOCAL_DEPENDENCIES", () => {
    assert.equal(
      classifyImport("./tokens/ERC20Base.sol", scope),
      ImportGroup.LOCAL_DEPENDENCIES,
    );
  });

  it("classifies ../ relative import as LOCAL_DEPENDENCIES", () => {
    assert.equal(
      classifyImport("../shared/utils/MathLib.sol", scope),
      ImportGroup.LOCAL_DEPENDENCIES,
    );
  });

  it("respects a custom first-party scope", () => {
    assert.equal(
      classifyImport("@my-org/core/interfaces/IFoo.sol", "@my-org"),
      ImportGroup.FIRST_PARTY_INTERFACES,
    );
    assert.equal(
      classifyImport("@my-org/core/lib/Foo.sol", "@my-org"),
      ImportGroup.FIRST_PARTY_PACKAGES,
    );
    assert.equal(
      classifyImport("@openzeppelin/contracts/Foo.sol", "@my-org"),
      ImportGroup.EXTERNAL_DEPENDENCIES,
    );
  });

  it("accepts scope with or without trailing slash", () => {
    assert.equal(
      classifyImport("@my-org/core/interfaces/IFoo.sol", "@my-org/"),
      ImportGroup.FIRST_PARTY_INTERFACES,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit: deduplicate
// ─────────────────────────────────────────────────────────────────────────────
describe("deduplicate", () => {
  it("removes second occurrence of the same path", () => {
    const chunks = [
      { raw: 'import "A.sol";', path: "A.sol" },
      { raw: 'import "B.sol";', path: "B.sol" },
      { raw: 'import "A.sol";', path: "A.sol" },
    ];
    const result = deduplicate(chunks);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((c) => c.path),
      ["A.sol", "B.sol"],
    );
  });

  it("keeps all entries when there are no duplicates", () => {
    const chunks = [
      { raw: 'import "A.sol";', path: "A.sol" },
      { raw: 'import "B.sol";', path: "B.sol" },
    ];
    assert.equal(deduplicate(chunks).length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: sortImports
// ─────────────────────────────────────────────────────────────────────────────
describe("sortImports – full file", () => {
  const SCOPE = "@balancer-labs";

  it("produces the canonical output from the skill spec example", () => {
    const input = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./tokens/ERC20Base.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import "../shared/utils/MathLib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@balancer-labs/v3-interfaces/contracts/pool-utils/IBasePool.sol";

contract MyPool {}
`;

    const expected = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@balancer-labs/v3-interfaces/contracts/pool-utils/IBasePool.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";

import "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";

import "../shared/utils/MathLib.sol";
import "./tokens/ERC20Base.sol";

contract MyPool {}
`;

    assert.equal(sortImports(input, SCOPE), expected);
  });

  it("preserves trailing newline", () => {
    const input = `pragma solidity ^0.8.0;\n\nimport "./B.sol";\nimport "./A.sol";\n`;
    const result = sortImports(input, SCOPE);
    assert.ok(result.endsWith("\n"), "should end with newline");
  });

  it("does not add a trailing newline when original has none", () => {
    const input = `pragma solidity ^0.8.0;\n\nimport "./B.sol";\nimport "./A.sol";`;
    const result = sortImports(input, SCOPE);
    assert.ok(!result.endsWith("\n"), "should not end with newline");
  });

  it("leaves file unchanged when there are no imports", () => {
    const input = `pragma solidity ^0.8.0;\n\ncontract Foo {}\n`;
    assert.equal(sortImports(input, SCOPE), input);
  });

  it("removes duplicate imports", () => {
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Foo.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    const importLines = result
      .split("\n")
      .filter((l) => l.startsWith("import"));
    assert.equal(importLines.length, 2);
    assert.ok(importLines.some((l) => l.includes("Ownable")));
    assert.ok(importLines.some((l) => l.includes("Foo")));
  });

  it("sorts within group by descending path length", () => {
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    const lines = result.split("\n").filter((l) => l.startsWith("import"));
    // longest path first
    assert.ok(
      lines[0].includes("ERC20Burnable"),
      `expected ERC20Burnable first, got: ${lines[0]}`,
    );
    assert.ok(
      lines[1].includes("IERC20"),
      `expected IERC20 second, got: ${lines[1]}`,
    );
    assert.ok(
      lines[2].includes("Ownable"),
      `expected Ownable third, got: ${lines[2]}`,
    );
  });

  it("uses alphabetical order as tiebreaker for equal-length paths", () => {
    // Craft two paths of identical length: 42 chars each
    // @openzeppelin/contracts/access/Ownable.sol  = 42
    // @openzeppelin/contracts/token/XXXXXXXX.sol  = 42 (pad to match)
    // Easier: just use two paths we can control
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC777.sol";
import "@openzeppelin/contracts/token/ERC165.sol";

contract X {}
`;
    // Both paths are identical length — ERC165 < ERC777 alphabetically
    const result = sortImports(input, SCOPE);
    const lines = result.split("\n").filter((l) => l.startsWith("import"));
    assert.ok(
      lines[0].includes("ERC165"),
      `expected ERC165 first (alphabetical), got: ${lines[0]}`,
    );
    assert.ok(
      lines[1].includes("ERC777"),
      `expected ERC777 second, got: ${lines[1]}`,
    );
  });

  it("separates groups with exactly one blank line", () => {
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import "./Foo.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    // Extract just the imports region
    const afterPragma = result.split("pragma solidity ^0.8.0;\n\n")[1];
    const beforeContract = afterPragma.split("\n\ncontract")[0];
    // Should have exactly two blank lines (three groups → two separators)
    const blankLines = beforeContract
      .split("\n")
      .filter((l) => l === "").length;
    assert.equal(blankLines, 2);
  });

  it("omits groups that have no members (no extra blank lines)", () => {
    // Only third-party and relative — groups 2 and 3 absent
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Foo.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    const afterPragma = result.split("pragma solidity ^0.8.0;\n\n")[1];
    const beforeContract = afterPragma.split("\n\ncontract")[0];
    const blankLines = beforeContract
      .split("\n")
      .filter((l) => l === "").length;
    assert.equal(blankLines, 1, "one blank line between two groups");
  });

  it("preserves named imports (curly brace style)", () => {
    const input = `pragma solidity ^0.8.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    assert.ok(
      result.includes(
        'import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";',
      ),
    );
    assert.ok(
      result.includes(
        'import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";',
      ),
    );
  });

  it("moves imports after pragma/SPDX and before contract", () => {
    const input = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Foo.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    const pragmaIdx = result.indexOf("pragma");
    const importIdx = result.indexOf("import");
    const contractIdx = result.indexOf("contract");
    assert.ok(pragmaIdx < importIdx, "pragma before import");
    assert.ok(importIdx < contractIdx, "import before contract");
  });

  it("handles a file with only one import", () => {
    const input = `pragma solidity ^0.8.0;\n\nimport "./Foo.sol";\n\ncontract X {}\n`;
    const result = sortImports(input, SCOPE);
    assert.ok(result.includes('import "./Foo.sol";'));
  });

  it("works with a custom first-party scope", () => {
    const input = `pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@my-org/core/interfaces/IFoo.sol";
import "@my-org/core/lib/Helpers.sol";
import "./Local.sol";

contract X {}
`;
    const result = sortImports(input, "@my-org");
    const lines = result.split("\n").filter((l) => l.startsWith("import"));
    assert.equal(
      lines[0],
      'import "@openzeppelin/contracts/access/Ownable.sol";',
      "group 1 first",
    );
    assert.equal(
      lines[1],
      'import "@my-org/core/interfaces/IFoo.sol";',
      "group 2 (interface) second",
    );
    assert.equal(
      lines[2],
      'import "@my-org/core/lib/Helpers.sol";',
      "group 3 (first-party) third",
    );
    assert.equal(lines[3], 'import "./Local.sol";', "group 4 (relative) last");
  });

  it("preserves inline comments attached to imports", () => {
    const input = `pragma solidity ^0.8.0;

// Used for access control
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Foo.sol";

contract X {}
`;
    const result = sortImports(input, SCOPE);
    // The comment should appear directly above its import
    const commentIdx = result.indexOf("// Used for access control");
    const ownableIdx = result.indexOf('import "@openzeppelin');
    assert.ok(commentIdx < ownableIdx, "comment precedes its import");
    // They should be on consecutive lines
    const commentLine = result
      .split("\n")
      .findIndex((l) => l.includes("// Used for access control"));
    const ownable = result
      .split("\n")
      .findIndex((l) => l.includes('import "@openzeppelin'));
    assert.equal(
      ownable,
      commentLine + 1,
      "comment is immediately above import",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-line imports and relative interfaces
// ─────────────────────────────────────────────────────────────────────────────
describe("multi-line imports", () => {
  it("preserves a multi-line named import and does not drop it", () => {
    const input = `pragma solidity ^0.8.24;

import {
    IReClammPoolExtension,
    ReClammPoolDynamicData,
    ReClammPoolImmutableData
} from "./interfaces/IReClammPoolExtension.sol";
import { FixedPoint } from "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";

contract X {}
`;
    const result = sortImports(input, "@balancer-labs");
    // Both imports must survive
    assert.ok(
      result.includes("IReClammPoolExtension"),
      "multi-line import must not be dropped",
    );
    assert.ok(result.includes("FixedPoint"), "single-line import must survive");
  });

  it("extracts the correct path from a multi-line import for sorting", () => {
    const input = `pragma solidity ^0.8.24;

import { FixedPoint } from "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";
import {
    IReClammPoolExtension,
    ReClammPoolDynamicData
} from "./interfaces/IReClammPoolExtension.sol";
import { ReClammMath } from "./lib/ReClammMath.sol";

contract X {}
`;
    const result = sortImports(input, "@balancer-labs");
    const importLines = result
      .split("\n")
      .filter((l) => l.trim().startsWith("import"));
    // FixedPoint is first-party (group 3), relative imports are group 4
    // Group 3 should come before group 4
    const fixedPointIdx = result.indexOf("FixedPoint");
    const reClammMathIdx = result.indexOf("ReClammMath");
    assert.ok(
      fixedPointIdx < reClammMathIdx,
      "first-party group before relative group",
    );
  });

  it("handles the exact diff from the bug report without dropping imports", () => {
    const input = `// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import { IVaultErrors } from "@balancer-labs/v3-interfaces/contracts/vault/IVaultErrors.sol";
import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import { IHooks } from "@balancer-labs/v3-interfaces/contracts/vault/IHooks.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";

import { FixedPoint } from "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";
import { VaultGuard } from "@balancer-labs/v3-vault/contracts/VaultGuard.sol";

import {
    IReClammPoolExtension,
    ReClammPoolDynamicData,
    ReClammPoolImmutableData
} from "./interfaces/IReClammPoolExtension.sol";
import { ReClammMath, PriceRatioState, a, b } from "./lib/ReClammMath.sol";
import { IReClammPoolMain } from "./interfaces/IReClammPoolMain.sol";
import { ReClammPoolParams } from "./interfaces/IReClammPool.sol";
import { ReClammCommon } from "./ReClammCommon.sol";

contract ReClammPoolExtension {}
`;
    const result = sortImports(input, "@balancer-labs");

    // No imports should be dropped
    assert.ok(result.includes("IVaultErrors"), "IVaultErrors present");
    assert.ok(result.includes("IVault"), "IVault present");
    assert.ok(result.includes("IHooks"), "IHooks present");
    assert.ok(result.includes("VaultTypes"), "VaultTypes present");
    assert.ok(result.includes("FixedPoint"), "FixedPoint present");
    assert.ok(result.includes("VaultGuard"), "VaultGuard present");
    assert.ok(
      result.includes("IReClammPoolExtension"),
      "multi-line import present",
    );
    assert.ok(result.includes("ReClammMath"), "ReClammMath present");
    assert.ok(result.includes("IReClammPoolMain"), "IReClammPoolMain present");
    assert.ok(
      result.includes("ReClammPoolParams"),
      "ReClammPoolParams present",
    );
    assert.ok(result.includes("ReClammCommon"), "ReClammCommon present");

    // Relative imports (group 4) must come after first-party (groups 2 & 3)
    const fixedPointIdx = result.indexOf("FixedPoint");
    const reClammCommonIdx = result.indexOf("ReClammCommon");
    assert.ok(fixedPointIdx < reClammCommonIdx, "first-party before relative");

    // Relative interfaces stay in group 4, not promoted to group 2
    const relativeInterfaceIdx = result.indexOf("IReClammPoolMain");
    const firstPartyIdx = result.indexOf("FixedPoint");
    assert.ok(
      firstPartyIdx < relativeInterfaceIdx,
      "relative interface stays in group 4, after first-party",
    );
  });
});

describe("relative interface classification", () => {
  it("keeps relative interface imports in LOCAL_DEPENDENCIES, not FIRST_PARTY_INTERFACES", () => {
    assert.equal(
      classifyImport("./interfaces/IFoo.sol", "@balancer-labs"),
      ImportGroup.LOCAL_DEPENDENCIES,
    );
    assert.equal(
      classifyImport("../interfaces/IBar.sol", "@balancer-labs"),
      ImportGroup.LOCAL_DEPENDENCIES,
    );
  });

  it("multi-line relative interface import is classified as group 4", () => {
    const input = `pragma solidity ^0.8.0;

import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import {
    IFoo,
    IBar
} from "./interfaces/IFoo.sol";

contract X {}
`;
    const result = sortImports(input, "@balancer-labs");
    // IVault (group 2) must appear before the relative interface (group 4)
    const vaultIdx = result.indexOf("IVault");
    const fooIdx = result.indexOf("IFoo");
    assert.ok(
      vaultIdx < fooIdx,
      "first-party interface before relative interface",
    );
  });

  it("extractPath correctly handles multi-line import with quoted symbol names", () => {
    // Ensures we grab the LAST quoted string (the path), not a symbol name
    const multiLine = `import {
    IReClammPoolExtension,
    ReClammPoolDynamicData
} from "./interfaces/IReClammPoolExtension.sol";`;
    assert.equal(
      extractPath(multiLine),
      "./interfaces/IReClammPoolExtension.sol",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bare (non-specific) imports sort last within their group
// ─────────────────────────────────────────────────────────────────────────────
describe("bare imports sort after specific imports within a group", () => {
  const { isSpecificImport } = require("../src/sort-imports");

  it("detects a bare import as non-specific", () => {
    assert.equal(
      isSpecificImport(
        'import "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";',
      ),
      false,
    );
  });

  it("detects named imports as specific", () => {
    assert.equal(
      isSpecificImport(
        'import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";',
      ),
      true,
    );
    assert.equal(isSpecificImport('import * as Foo from "./Foo.sol";'), true);
  });

  it("places a bare import after specific imports in the same group", () => {
    const input = `pragma solidity ^0.8.24;

import { IVaultErrors } from "@balancer-labs/v3-interfaces/contracts/vault/IVaultErrors.sol";
import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import { IHooks } from "@balancer-labs/v3-interfaces/contracts/vault/IHooks.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";

contract X {}
`;
    const result = sortImports(input, "@balancer-labs");
    const lines = result
      .split("\n")
      .filter((l) => l.trim().startsWith("import"));
    // VaultTypes is bare — must be last in its group
    assert.ok(
      lines[lines.length - 1].includes("VaultTypes"),
      `expected VaultTypes last, got: ${lines[lines.length - 1]}`,
    );
    // Specific imports come first
    assert.ok(
      lines[0].includes("IVaultErrors") ||
        lines[0].includes("IHooks") ||
        lines[0].includes("IVault"),
      "specific import first",
    );
  });

  it("reproduces the correct order from the reported diff", () => {
    const input = `// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import { IVaultErrors } from "@balancer-labs/v3-interfaces/contracts/vault/IVaultErrors.sol";
import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import { IHooks } from "@balancer-labs/v3-interfaces/contracts/vault/IHooks.sol";
import "@balancer-labs/v3-interfaces/contracts/vault/VaultTypes.sol";

import { FixedPoint } from "@balancer-labs/v3-solidity-utils/contracts/math/FixedPoint.sol";
import { VaultGuard } from "@balancer-labs/v3-vault/contracts/VaultGuard.sol";

import {
    IReClammPoolExtension,
    ReClammPoolDynamicData,
    ReClammPoolImmutableData
} from "./interfaces/IReClammPoolExtension.sol";
import { ReClammMath, PriceRatioState, a, b } from "./lib/ReClammMath.sol";
import { IReClammPoolMain } from "./interfaces/IReClammPoolMain.sol";
import { ReClammPoolParams } from "./interfaces/IReClammPool.sol";
import { ReClammCommon } from "./ReClammCommon.sol";

contract ReClammPoolExtension {}
`;
    const result = sortImports(input, "@balancer-labs");
    const lines = result.split("\n");

    // In group 2 (first-party interfaces), VaultTypes must be last
    const vaultTypesIdx = lines.findIndex((l) => l.includes("VaultTypes"));
    const iVaultIdx = lines.findIndex(
      (l) => l.includes('"IVault"') || l.includes("IVault.sol"),
    );
    const iHooksIdx = lines.findIndex((l) => l.includes("IHooks"));
    assert.ok(iVaultIdx < vaultTypesIdx, "IVault before VaultTypes");
    assert.ok(iHooksIdx < vaultTypesIdx, "IHooks before VaultTypes");

    // In group 4 (relative), ReClammMath (non-interface lib) must be after interface imports
    const reClammMathIdx = lines.findIndex((l) => l.includes("ReClammMath"));
    const reClammPoolMainIdx = lines.findIndex((l) =>
      l.includes("IReClammPoolMain"),
    );
    assert.ok(
      reClammPoolMainIdx < reClammMathIdx,
      "relative interface imports before lib imports",
    );
  });
});
