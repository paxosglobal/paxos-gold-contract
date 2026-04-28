// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { PaxosTokenV2 } from "../paxos-token-contracts/contracts/PaxosTokenV2.sol";

/**
 * @title PAXG Smart contract
 * @dev This contract is a {PaxosTokenV2} ERC20 token for Paxos Gold.
 *
 * The deployed PAXG (Solidity 0.4.24) has a different storage layout from
 * BaseStorage in slots 4-8. Two active fields need special handling:
 *
 * 1. `paused` — at slot 5 byte 20 in deployed PAXG, but slot 4 byte 20 in
 *    BaseStorage. Migrated during initialize by repacking into slot 4.
 *
 * 2. `frozen` mapping — at slot 7 in deployed PAXG, slot 6 in BaseStorage.
 *    Moving would require re-writing every entry (mapping data lives at
 *    keccak256(key, slot)), so frozen accessors are overridden to read/write
 *    from slot 7 instead.
 *
 * Deprecated slots with public getters (5, 8) are zeroed during migration
 * so the auto-generated getters return 0x0 rather than misleading V1 values.
 * Slot 7 (supplyControllerDeprecated) is already 0x0 — Solidity never writes
 * to a mapping's base slot. All other deprecated slots are left as-is.
 *
 * @custom:security-contact smart-contract-security@paxos.com
 */
contract PAXG is PaxosTokenV2 {
    /**
     * @dev The base slot number where the frozen mapping data lives in the
     * deployed PAXG contract. BaseStorage declares frozen at slot 6, but
     * the deployed data is at slot 7. Mapping values are stored at
     * keccak256(abi.encode(key, slot)), so we must use the original slot.
     *
     * NOTE: BaseStorage's `frozen` mapping (slot 6) is intentionally unused
     * for PAXG. All frozen access goes through the slot 7 overrides below.
     * Do not access `frozen[addr]` directly — it will return incorrect results.
     */
    uint256 private constant _PAXG_FROZEN_SLOT = 7;

    /*
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return "Paxos Gold";
    }

    /*
     * @dev Returns the symbol of the token.
     */
    function symbol() public view virtual override returns (string memory) {
        return "PAXG";
    }

    /*
     * @dev Returns the decimal count of the token.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * @dev Migrates PAXG's V1 storage layout to BaseStorage layout during upgrade.
     */
    function _onUpgradeInitialize() internal override {
        _migratePAXGStorage();
    }

    /**
     * @dev Override to read frozen state from PAXG's original slot 7
     * instead of BaseStorage's slot 6.
     */
    function _isAddrFrozen(address addr) internal view override returns (bool) {
        bytes32 slot = keccak256(abi.encode(addr, _PAXG_FROZEN_SLOT));
        bool val;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            val := sload(slot)
        }
        return val;
    }

    /**
     * @dev Override to write frozen state to PAXG's original slot 7
     * instead of BaseStorage's slot 6.
     */
    function _freeze(address addr) internal override {
        bytes32 slot = keccak256(abi.encode(addr, _PAXG_FROZEN_SLOT));
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, 1)
        }
        emit FreezeAddress(addr);
    }

    /**
     * @dev Override to clear frozen state from PAXG's original slot 7
     * instead of BaseStorage's slot 6.
     */
    function _unfreeze(address addr) internal override {
        bytes32 slot = keccak256(abi.encode(addr, _PAXG_FROZEN_SLOT));
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, 0)
        }
        emit UnfreezeAddress(addr);
    }

    /**
     * @dev Migrate storage from PAXG V1 layout to BaseStorage layout.
     *
     * Active field migration:
     *   paused: slot 5 byte 20 (PAXG) → slot 4 byte 20 (BaseStorage)
     *   frozen: stays at slot 7 (handled by virtual overrides, not migration)
     *
     * Deprecated slot cleanup:
     *   Unlike the PYUSD upgrade (where deprecated slots held correctly-labeled
     *   stale values), PAXG's slot shuffling means deprecated slots would hold
     *   values from different V1 fields. All such slots are zeroed to avoid
     *   mislabeled data in raw storage inspection:
     *   - Slots 5, 8: public getters would return wrong V1 values
     *   - Slot 6: no getter (mapping base), but holds stale assetProtectionRole
     *   - Slots 14-15: in BaseStorage's gap, but hold stale fee addresses
     *   Slot 13 (feeRate) is not zeroed — setSupplyControl() overwrites it.
     *
     * Slots left as-is:
     *   slot 4 low bytes: owner address (same position in both layouts)
     *   slot 7: still the active frozen mapping base (used by overrides)
     *   slots 9-12: deprecated values at matching positions in both layouts
     */
    function _migratePAXGStorage() private {
        // No separate guard needed — reinitializer(2) in the parent initialize
        // already ensures this function can only run once.

        // solhint-disable-next-line no-inline-assembly
        assembly {
            let slot4Val := sload(4) // owner address (low 20 bytes)
            let slot5Val := sload(5) // proposedOwner (low 20 bytes) + paused (byte 20)

            let ownerAddr := and(slot4Val, 0xffffffffffffffffffffffffffffffffffffffff)
            let pausedFlag := and(shr(160, slot5Val), 0xff)

            // Pack owner + paused into slot 4 (BaseStorage layout)
            sstore(4, or(ownerAddr, shl(160, pausedFlag)))

            // Zero deprecated slots that hold mislabeled V1 data.
            // Slot 7 is left alone — it's still the active frozen mapping base
            // (PAXG reads/writes frozen data at keccak256(addr, 7) via overrides).
            sstore(5, 0)  // was proposedOwner+paused → assetProtectionRoleDeprecated
            sstore(6, 0)  // was assetProtectionRole  → frozen mapping base (no getter)
            sstore(8, 0)  // was supplyController     → proposedOwnerDeprecated
            sstore(14, 0) // was feeController        → in BaseStorage gap
            sstore(15, 0) // was feeRecipient         → in BaseStorage gap
        }
    }
}
