# prettier-plugin-solidity-import-sorter

A [Prettier](https://prettier.io/) plugin that sorts `import` statements in Solidity (`.sol`) files according to a strict grouping and ordering convention.

Zero runtime dependencies.

---

## What it does

Imports are sorted into four groups, separated by a blank line:

| #   | Group                      | Criteria                                                       |
| --- | -------------------------- | -------------------------------------------------------------- |
| 1   | **Third-party packages**   | Anything that is not first-party, and not a relative path      |
| 2   | **First-party interfaces** | First-party scope **and** a path segment contains `interfaces` |
| 3   | **First-party packages**   | First-party scope, no `interfaces` segment                     |
| 4   | **Relative imports**       | Paths starting with `./` or `../`                              |

Within each group, imports are ordered by **descending path length** (longest first). Equal-length paths are sorted alphabetically.

Exact duplicate imports are automatically removed (first occurrence is kept).

Everything outside the imports block — pragma, license identifier, contract code — is left completely untouched.

---

## Installation

### Using npm

```bash
npm install --save-dev prettier-plugin-solidity-import-sorter
```

Prettier must also be installed (v2 or v3):

```bash
npm install --save-dev prettier
```

### Using yarn

```bash
yarn add --dev prettier-plugin-solidity-import-sorter
```

Prettier must also be installed (v2 or v3):

```bash
yarn add --dev prettier
```

---

## Configuration

### `prettier.config.js` (recommended)

```js
export default {
  plugins: ["prettier-plugin-solidity-import-sorter"],

  // Optional: set your first-party / monorepo package scope.
  // Imports under this scope are treated as first-party and split into
  // interface vs non-interface sub-groups.
  // Default: "@balancer-labs"
  solidityFirstPartyScope: "@my-org",
};
```

### `.prettierrc`

```json
{
  "plugins": ["prettier-plugin-solidity-import-sorter"],
  "solidityFirstPartyScope": "@my-org"
}
```

---

## Usage

### Format a file

```bash
npx prettier --write contracts/MyContract.sol
```

### Format all Solidity files

```bash
npx prettier --write "contracts/**/*.sol"
```

### Check without writing (CI)

```bash
npx prettier --check "contracts/**/*.sol"
```

### Specify the parser explicitly

```bash
npx prettier --plugin prettier-plugin-solidity-import-sorter \
             --parser solidity-import-sorter \
             --write contracts/MyContract.sol
```

---

## Example

**Input**

```solidity
// SPDX-License-Identifier: MIT
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
```

**Output** (with `solidityFirstPartyScope: "@balancer-labs"`)

```solidity
// SPDX-License-Identifier: MIT
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
```

---

## Running tests

```bash
npm test
```

Tests use Node's built-in test runner (`node:test`) — no additional test framework needed.

---

## Options reference

| Option                    | Type     | Default            | Description                                                                                                                                                                                                   |
| ------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solidityFirstPartyScope` | `string` | `"@balancer-labs"` | The npm scope (or package prefix) that identifies first-party packages. Imports under this scope are split into _first-party interfaces_ (any path segment contains `interfaces`) and _first-party packages_. |

---

## How first-party interface detection works

An import is classified as **group 2 (first-party interface)** when:

1. It starts with the configured `solidityFirstPartyScope`, **and**
2. At least one slash-delimited segment of the path contains the word `interfaces`

This matches both:

- Package names like `@balancer-labs/v3-interfaces/...` (`v3-interfaces` contains `interfaces`)
- Directory paths like `@my-org/core/interfaces/IFoo.sol` (`interfaces` is a path segment)
