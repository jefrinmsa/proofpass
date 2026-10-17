pragma circom 2.2.0;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Membership in a college-authorized registry; no OCR assertions are trusted here.
template Student(depth) {
    signal input root;
    signal input scope;
    signal input wallet;
    signal input validUntil;
    signal input signalHash;
    signal input rollHash;
    signal input expiry;
    signal input secret;
    signal input siblings[depth];
    signal input directions[depth];
    signal output nullifier;
    signal output binding;
    component expiryBits = Num2Bits(64);
    component untilBits = Num2Bits(64);
    component walletBits = Num2Bits(160);
    expiryBits.in <== expiry;
    untilBits.in <== validUntil;
    walletBits.in <== wallet;
    component valid = LessEqThan(64);
    valid.in[0] <== validUntil;
    valid.in[1] <== expiry;
    valid.out === 1;
    component commitment = Poseidon(1);
    commitment.inputs[0] <== secret;
    component leaf = Poseidon(4);
    leaf.inputs[0] <== rollHash;
    leaf.inputs[1] <== expiry;
    leaf.inputs[2] <== wallet;
    leaf.inputs[3] <== commitment.out;
    signal nodes[depth+1];
    signal left[depth];
    signal right[depth];
    component hashes[depth];
    nodes[0] <== leaf.out;
    for (var i=0; i<depth; i++) {
        directions[i] * (directions[i]-1) === 0;
        left[i] <== nodes[i] + directions[i] * (siblings[i]-nodes[i]);
        right[i] <== siblings[i] + directions[i] * (nodes[i]-siblings[i]);
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== left[i];
        hashes[i].inputs[1] <== right[i];
        nodes[i+1] <== hashes[i].out;
    }
    nodes[depth] === root;
    component account = Poseidon(2);
    account.inputs[0] <== secret;
    account.inputs[1] <== scope;
    nullifier <== account.out;
    component login = Poseidon(2);
    login.inputs[0] <== secret;
    login.inputs[1] <== signalHash;
    binding <== login.out;
}
component main {public [root, scope, wallet, validUntil, signalHash]} = Student(8);
