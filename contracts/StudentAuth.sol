// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "./StudentGroth16Verifier.sol";

/// @notice College demo registry. Root updates invalidate previous membership proofs.
contract StudentAuth {
    address public immutable owner;
    StudentGroth16Verifier public immutable verifier;
    uint256 public registryRoot;
    event RegistryUpdated(uint256 root);
    event Demonstrated(address indexed sender, uint256 nullifier);
    constructor(address groth16) {
        require(block.chainid == 31337 || block.chainid == 11155111, "test networks only");
        owner = msg.sender;
        verifier = StudentGroth16Verifier(groth16);
    }
    function setRegistryRoot(uint256 root) external {
        require(msg.sender == owner, "college only");
        require(root > 0 && root < 21888242871839275222246405745257275088548364400416034343698204186575808495617, "invalid root");
        registryRoot = root;
        emit RegistryUpdated(root);
    }
    // Public signals: nullifier, login binding, root, scope, wallet, validUntil, signal.
    function verify(uint256[8] calldata p, uint256[7] calldata s) public view returns(bool) {
        if (registryRoot == 0 || s[2] != registryRoot || s[5] < block.timestamp || s[5] > block.timestamp + 8 hours + 5 minutes) return false;
        return verifier.verifyProof([p[0],p[1]],[[p[2],p[3]],[p[4],p[5]]],[p[6],p[7]],s);
    }
    function demonstrate(uint256[8] calldata p, uint256[7] calldata s) external {
        require(s[4] == uint256(uint160(msg.sender)), "wallet mismatch");
        require(verify(p,s), "invalid student proof");
        emit Demonstrated(msg.sender,s[0]);
    }
}
