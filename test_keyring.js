require('dotenv').config();
const { GearKeyring } = require('@gear-js/api');

console.log('Testing keyring creation...\n');

// Test 1: Inspect GearKeyring
console.log('GearKeyring methods:',  Object.getOwnPropertyNames(GearKeyring));
console.log('');

// Test 2: Test account
console.log('Test 1: //Alice');
try {
  const alice = GearKeyring.fromSuri('//Alice');
  console.log('  Type:', typeof alice);
  console.log('  Constructor:', alice.constructor.name);
  console.log('  Keys:', Object.keys(alice));
  console.log('  All props:', Object.getOwnPropertyNames(alice));
  console.log('  Address:', alice.address);
  console.log('  Public Key:', alice.publicKey);
  
  // Try different access patterns
  console.log('  JSON:', JSON.stringify(alice, null, 2));
} catch (e) {
  console.log('  Error:', e.message);
}
console.log('');

// Test 3: Try fromMnemonic if it exists
console.log('Test 2: Try fromMnemonic');
if (GearKeyring.fromMnemonic) {
  const mnemonic = process.env.VARA_MNEMONIC;
  const keyring = GearKeyring.fromMnemonic(mnemonic);
  console.log('  Address:', keyring.address);
} else {
  console.log('  fromMnemonic not available');
}
