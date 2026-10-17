// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "@anon-aadhaar/contracts/src/AnonAadhaar.sol";
import "@anon-aadhaar/contracts/src/Verifier.sol";

/// @notice Educational test-credential verifier. Never use this deployment for real identity.
contract TestAadhaarAuth {
    AnonAadhaar public immutable aadhaar;
    uint256 public immutable testPublicKeyHash;
    event Demonstrated(address indexed sender, uint256 signal);
    constructor(address verifier, uint256 keyHash) {
        require(block.chainid == 31337 || block.chainid == 11155111, "test networks only");
        aadhaar = AnonAadhaar(verifier);
        require(aadhaar.storedPublicKeyHash() == keyHash, "key mismatch");
        testPublicKeyHash = keyHash;
    }
    function verify(uint256 seed,uint256 nullifier,uint256 timestamp,uint256 signal,uint256[4] calldata reveal,uint256[8] calldata proof) public view returns(bool) {
        // Upstream predicate is completed age >18 at QR signing date, not >=18.
        if(reveal[0] != 1 || reveal[1] != 0 || reveal[2] != 0 || reveal[3] != 0 || timestamp > block.timestamp) return false;
        return aadhaar.verifyAnonAadhaarProof(seed,nullifier,timestamp,signal,reveal,proof);
    }
    /// @notice Optional public demonstration; does NOT create an application login session.
    function demonstrate(uint256 seed,uint256 nullifier,uint256 timestamp,uint256 signal,uint256[4] calldata reveal,uint256[8] calldata proof) external {
        require(verify(seed,nullifier,timestamp,signal,reveal,proof),"invalid proof or policy");
        emit Demonstrated(msg.sender,signal);
    }
}
