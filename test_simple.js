#!/usr/bin/env node
/**
 * Simple test - just check contract state and send a basic query
 */

require('dotenv').config();
const { GearApi, GearKeyring } = require('@gear-js/api');

async function main() {
  console.log('🔌 Connecting to Vara Network...\n');
  const api = await GearApi.create({ providerAddress: 'wss://testnet.vara.network' });
  
  console.log('✅ Connected!\n');
  
  // Load addresses
  const addresses = require('./DEPLOYMENT_MANIFEST.json');
  const usdcToken = addresses.contracts.usdc_token.program_id;
  
  console.log('📋 Contract Info:');
  console.log(`   USDC Token: ${usdcToken}`);
  console.log('');
  
  // Create keyring
  console.log('👤 Creating keyring...');
  const mnemonic = process.env.VARA_MNEMONIC || '//Alice';
  const keyring = await GearKeyring.fromSuri(mnemonic);
  console.log(`   Address: ${keyring.address}`);
  console.log('');
  
  // Check if contract is on chain
  console.log('🔍 Checking contract status...');
  try {
    const program = await api.program.programState.read(usdcToken);
    console.log('   Contract exists:', !!program);
  } catch (e) {
    console.log('   Error reading contract:', e.message);
  }
  
  console.log('');
  console.log('💡 Recommendation:');
  console.log('   The contracts may need to be initialized or funded first.');
  console.log('   Make sure your account has tokens for gas fees.');
  console.log('');
  console.log('   Your address:', keyring.address);
  console.log('   Get testnet tokens: https://idea.gear-tech.io/');
  
  await api.disconnect();
  console.log('\n✅ Test complete!');
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
