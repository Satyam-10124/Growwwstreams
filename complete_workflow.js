#!/usr/bin/env node
/**
 * Complete Hyper Vara Streams Workflow Example
 * Demonstrates the full lifecycle from project creation to final payment
 */

require('dotenv').config();

const { HyperVaraStreamsAPI } = require('./hyper_vara_streams_api');
const fs = require('fs');
const path = require('path');

// Load contract addresses from deployment manifest
function loadContractAddresses() {
  const manifestPath = path.join(__dirname, 'DEPLOYMENT_MANIFEST.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ Deployment manifest not found. Please deploy contracts first.');
    process.exit(1);
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  return {
    usdcToken: manifest.contracts.usdc_token.program_id,
    escrowManager: manifest.contracts.escrow_manager.program_id,
    verificationBridge: manifest.contracts.verification_bridge.program_id
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     HYPER VARA STREAMS - COMPLETE WORKFLOW                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Initialize API
  const api = new HyperVaraStreamsAPI();
  const addresses = loadContractAddresses();
  
  await api.connect('wss://testnet.vara.network', addresses);

  // Create keyrings (in production, load from secure storage)
  // Option 1: Use environment variable (recommended)
  const ownerSeed = process.env.VARA_MNEMONIC || '//Alice';
  const projectOwner = await api.createKeyring(ownerSeed);
  
  // For demo purposes, use test accounts for developer and relayer
  // In production, these would be different real accounts
  const developer = await api.createKeyring('//Bob');
  const relayer = await api.createKeyring('//Charlie');

  console.log('\n👥 Participants:');
  console.log(`   Project Owner: ${projectOwner.address}`);
  console.log(`   Developer: ${developer.address}`);
  console.log(`   Relayer: ${relayer.address}`);

  try {
    // ========================================================================
    // Step 1: Setup - Mint USDC tokens to project owner
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 1: Setup - Mint USDC Tokens');
    console.log('='.repeat(70));
    
    const projectBudget = 100000n; // 100,000 USDC (with 6 decimals would be 100,000,000,000)
    
    await api.usdc.mint(projectOwner.address, projectBudget, projectOwner);
    
    const ownerBalance = await api.usdc.balanceOf(projectOwner.address);
    console.log(`✅ Owner balance: ${ownerBalance} USDC`);

    // ========================================================================
    // Step 2: Create Project
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 2: Create Project');
    console.log('='.repeat(70));
    
    // Milestones: 30%, 30%, 40% (in basis points: 3000, 3000, 4000)
    const milestones = [3000, 3000, 4000];
    
    await api.escrow.createProject(projectBudget, milestones, projectOwner);

    // ========================================================================
    // Step 3: Set Verifier (Verification Bridge)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 3: Set Verification Bridge as Verifier');
    console.log('='.repeat(70));
    
    await api.escrow.setVerifier(addresses.verificationBridge, projectOwner);

    // ========================================================================
    // Step 4: Setup Bridge - Set Relayer
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 4: Setup Verification Bridge');
    console.log('='.repeat(70));
    
    await api.bridge.setRelayer(1, relayer.address, projectOwner);
    await api.bridge.setEscrowManager(addresses.escrowManager, projectOwner);

    // ========================================================================
    // Step 5: Fund Project
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 5: Fund Project (Transfer USDC to Escrow)');
    console.log('='.repeat(70));
    
    // First approve USDC transfer
    await api.usdc.transfer(addresses.escrowManager, projectBudget, projectOwner);
    
    // Then call fund_project
    await api.escrow.fundProject(projectOwner);
    
    console.log('💰 Breakdown:');
    console.log(`   60% (${projectBudget * 60n / 100n}) → Progress Pool`);
    console.log(`   35% (${projectBudget * 35n / 100n}) → Final Pool`);
    console.log(`   5% (${projectBudget * 5n / 100n}) → Treasury Fee`);

    // ========================================================================
    // Step 6: Select Developer
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 6: Select Developer');
    console.log('='.repeat(70));
    
    await api.escrow.selectDeveloper(developer.address, projectOwner);

    // ========================================================================
    // Step 7: Milestone 1 Completion (30%)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 7: Milestone 1 - Complete (30%)');
    console.log('='.repeat(70));
    
    // Relayer submits attestation from Hyperliquid
    await api.bridge.submitAttestation(1, 10000, relayer); // 100% of milestone 1 = 30% of project
    
    const devBalance1 = await api.usdc.balanceOf(developer.address);
    console.log(`✅ Developer balance: ${devBalance1} USDC`);

    // ========================================================================
    // Step 8: Milestone 2 Completion (30%)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 8: Milestone 2 - Complete (30%)');
    console.log('='.repeat(70));
    
    await api.bridge.submitAttestation(2, 10000, relayer); // 100% of milestone 2 = 30% of project
    
    const devBalance2 = await api.usdc.balanceOf(developer.address);
    console.log(`✅ Developer balance: ${devBalance2} USDC`);

    // ========================================================================
    // Step 9: Milestone 3 Partial Progress (20% of 40%)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 9: Milestone 3 - Partial (50% = 20% of project)');
    console.log('='.repeat(70));
    
    await api.bridge.submitAttestation(3, 5000, relayer); // 50% of milestone 3 = 20% of project
    
    const devBalance3 = await api.usdc.balanceOf(developer.address);
    console.log(`✅ Developer balance: ${devBalance3} USDC`);

    // ========================================================================
    // Step 10: Milestone 3 Complete (remaining 20%)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 10: Milestone 3 - Complete (100% = 40% of project)');
    console.log('='.repeat(70));
    
    await api.bridge.submitAttestation(3, 10000, relayer); // 100% of milestone 3
    
    const devBalance4 = await api.usdc.balanceOf(developer.address);
    console.log(`✅ Developer balance: ${devBalance4} USDC`);
    console.log(`📊 Progress Pool depleted: ${devBalance4} / ${projectBudget * 60n / 100n} USDC released`);

    // ========================================================================
    // Step 11: Final Delivery Approval (35%)
    // ========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('STEP 11: Final Delivery Approval');
    console.log('='.repeat(70));
    
    await api.escrow.markFinalApproved(projectOwner);
    
    const finalDevBalance = await api.usdc.balanceOf(developer.address);
    console.log(`✅ Final developer balance: ${finalDevBalance} USDC`);
    console.log(`📊 Total received: ${finalDevBalance} / ${projectBudget * 95n / 100n} USDC (95% of budget)`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         WORKFLOW COMPLETE                                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ All milestones completed successfully!');
    console.log(`   Developer earned: ${finalDevBalance} USDC`);
    console.log(`   Treasury fee: ${projectBudget * 5n / 100n} USDC`);
    console.log('   Payment distribution: 60% progressive + 35% final = 95% to developer');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await api.disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
