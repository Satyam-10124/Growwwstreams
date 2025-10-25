#!/usr/bin/env node
/**
 * Hyper Vara Streams REST API Server
 * Provides HTTP endpoints for all contract interactions
 */

const express = require('express');
const { HyperVaraStreamsAPI } = require('./hyper_vara_streams_api');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const VARA_RPC = process.env.VARA_RPC || 'wss://testnet.vara.network';

let api = null;
let keyrings = {}; // Store keyrings in memory (use Redis/DB in production)

// ============================================================================
// Helper Functions
// ============================================================================

function loadContractAddresses() {
  const manifestPath = path.join(__dirname, 'DEPLOYMENT_MANIFEST.json');
  
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  return {
    usdcToken: manifest.contracts.usdc_token?.program_id,
    escrowManager: manifest.contracts.escrow_manager?.program_id,
    verificationBridge: manifest.contracts.verification_bridge?.program_id
  };
}

function validateKeyring(keyringId) {
  if (!keyrings[keyringId]) {
    throw new Error(`Keyring '${keyringId}' not found. Please register it first.`);
  }
  return keyrings[keyringId];
}

// ============================================================================
// Middleware
// ============================================================================

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// ============================================================================
// System Endpoints
// ============================================================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    connected: api !== null,
    timestamp: new Date().toISOString()
  });
});

/**
 * Get contract addresses
 */
app.get('/contracts', (req, res) => {
  if (!api) {
    return res.status(503).json({ error: 'API not initialized' });
  }
  
  res.json({
    usdcToken: api.contracts.usdcToken,
    escrowManager: api.contracts.escrowManager,
    verificationBridge: api.contracts.verificationBridge
  });
});

/**
 * Initialize connection
 */
app.post('/connect', async (req, res, next) => {
  try {
    const addresses = loadContractAddresses();
    
    if (!addresses) {
      return res.status(400).json({ 
        error: 'Contract addresses not found. Please deploy contracts first.' 
      });
    }
    
    api = new HyperVaraStreamsAPI();
    await api.connect(VARA_RPC, addresses);
    
    res.json({ 
      message: 'Connected to Vara Network',
      contracts: addresses
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Keyring Management
// ============================================================================

/**
 * Register a keyring
 * POST /keyring/register
 * Body: { id: string, seed: string }
 */
app.post('/keyring/register', (req, res, next) => {
  try {
    const { id, seed } = req.body;
    
    if (!id || !seed) {
      return res.status(400).json({ error: 'Missing id or seed' });
    }
    
    if (!api) {
      return res.status(503).json({ error: 'API not initialized. Call /connect first.' });
    }
    
    keyrings[id] = api.createKeyring(seed);
    
    res.json({ 
      message: 'Keyring registered',
      id,
      address: keyrings[id].address
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List registered keyrings
 */
app.get('/keyring/list', (req, res) => {
  const list = Object.keys(keyrings).map(id => ({
    id,
    address: keyrings[id].address
  }));
  
  res.json({ keyrings: list });
});

// ============================================================================
// USDC Token Endpoints
// ============================================================================

/**
 * Mint USDC tokens
 * POST /usdc/mint
 * Body: { toAddress: string, amount: string, adminKeyringId: string }
 */
app.post('/usdc/mint', async (req, res, next) => {
  try {
    const { toAddress, amount, adminKeyringId } = req.body;
    
    if (!toAddress || !amount || !adminKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(adminKeyringId);
    const result = await api.usdc.mint(toAddress, BigInt(amount), keyring);
    
    res.json({ 
      message: 'Tokens minted successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Transfer USDC tokens
 * POST /usdc/transfer
 * Body: { toAddress: string, amount: string, senderKeyringId: string }
 */
app.post('/usdc/transfer', async (req, res, next) => {
  try {
    const { toAddress, amount, senderKeyringId } = req.body;
    
    if (!toAddress || !amount || !senderKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(senderKeyringId);
    const result = await api.usdc.transfer(toAddress, BigInt(amount), keyring);
    
    res.json({ 
      message: 'Transfer successful',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get USDC balance
 * GET /usdc/balance/:address
 */
app.get('/usdc/balance/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const balance = await api.usdc.balanceOf(address);
    
    res.json({ 
      address,
      balance: balance.toString()
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Escrow Manager Endpoints
// ============================================================================

/**
 * Create project
 * POST /escrow/create-project
 * Body: { budget: string, milestones: [number, number, number], ownerKeyringId: string }
 */
app.post('/escrow/create-project', async (req, res, next) => {
  try {
    const { budget, milestones, ownerKeyringId } = req.body;
    
    if (!budget || !milestones || !ownerKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (milestones.length !== 3) {
      return res.status(400).json({ error: 'Must provide exactly 3 milestone percentages' });
    }
    
    const keyring = validateKeyring(ownerKeyringId);
    const result = await api.escrow.createProject(BigInt(budget), milestones, keyring);
    
    res.json({ 
      message: 'Project created successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Fund project
 * POST /escrow/fund-project
 * Body: { ownerKeyringId: string }
 */
app.post('/escrow/fund-project', async (req, res, next) => {
  try {
    const { ownerKeyringId } = req.body;
    
    if (!ownerKeyringId) {
      return res.status(400).json({ error: 'Missing ownerKeyringId' });
    }
    
    const keyring = validateKeyring(ownerKeyringId);
    const result = await api.escrow.fundProject(keyring);
    
    res.json({ 
      message: 'Project funded successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Select developer
 * POST /escrow/select-developer
 * Body: { developerAddress: string, ownerKeyringId: string }
 */
app.post('/escrow/select-developer', async (req, res, next) => {
  try {
    const { developerAddress, ownerKeyringId } = req.body;
    
    if (!developerAddress || !ownerKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(ownerKeyringId);
    const result = await api.escrow.selectDeveloper(developerAddress, keyring);
    
    res.json({ 
      message: 'Developer selected successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Apply progress
 * POST /escrow/apply-progress
 * Body: { milestoneIndex: number, percentComplete: number, verifierKeyringId: string }
 */
app.post('/escrow/apply-progress', async (req, res, next) => {
  try {
    const { milestoneIndex, percentComplete, verifierKeyringId } = req.body;
    
    if (!milestoneIndex || percentComplete === undefined || !verifierKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(verifierKeyringId);
    const result = await api.escrow.applyProgress(milestoneIndex, percentComplete, keyring);
    
    res.json({ 
      message: 'Progress applied successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Mark final approved
 * POST /escrow/mark-final-approved
 * Body: { ownerKeyringId: string }
 */
app.post('/escrow/mark-final-approved', async (req, res, next) => {
  try {
    const { ownerKeyringId } = req.body;
    
    if (!ownerKeyringId) {
      return res.status(400).json({ error: 'Missing ownerKeyringId' });
    }
    
    const keyring = validateKeyring(ownerKeyringId);
    const result = await api.escrow.markFinalApproved(keyring);
    
    res.json({ 
      message: 'Final delivery approved',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Set verifier
 * POST /escrow/set-verifier
 * Body: { verifierAddress: string, ownerKeyringId: string }
 */
app.post('/escrow/set-verifier', async (req, res, next) => {
  try {
    const { verifierAddress, ownerKeyringId } = req.body;
    
    if (!verifierAddress || !ownerKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(ownerKeyringId);
    const result = await api.escrow.setVerifier(verifierAddress, keyring);
    
    res.json({ 
      message: 'Verifier set successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Verification Bridge Endpoints
// ============================================================================

/**
 * Set relayer
 * POST /bridge/set-relayer
 * Body: { relayerSlot: number, relayerAddress: string, adminKeyringId: string }
 */
app.post('/bridge/set-relayer', async (req, res, next) => {
  try {
    const { relayerSlot, relayerAddress, adminKeyringId } = req.body;
    
    if (!relayerSlot || !relayerAddress || !adminKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(adminKeyringId);
    const result = await api.bridge.setRelayer(relayerSlot, relayerAddress, keyring);
    
    res.json({ 
      message: 'Relayer set successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Submit attestation
 * POST /bridge/submit-attestation
 * Body: { milestoneIndex: number, percentComplete: number, relayerKeyringId: string }
 */
app.post('/bridge/submit-attestation', async (req, res, next) => {
  try {
    const { milestoneIndex, percentComplete, relayerKeyringId } = req.body;
    
    if (!milestoneIndex || percentComplete === undefined || !relayerKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(relayerKeyringId);
    const result = await api.bridge.submitAttestation(milestoneIndex, percentComplete, keyring);
    
    res.json({ 
      message: 'Attestation submitted successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get last percent
 * GET /bridge/last-percent/:milestoneIndex
 */
app.get('/bridge/last-percent/:milestoneIndex', async (req, res, next) => {
  try {
    const milestoneIndex = parseInt(req.params.milestoneIndex);
    const percent = await api.bridge.getLastPercent(milestoneIndex);
    
    res.json({ 
      milestoneIndex,
      percent,
      percentFormatted: `${percent / 100}%`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Set escrow manager
 * POST /bridge/set-escrow-manager
 * Body: { escrowManagerAddress: string, adminKeyringId: string }
 */
app.post('/bridge/set-escrow-manager', async (req, res, next) => {
  try {
    const { escrowManagerAddress, adminKeyringId } = req.body;
    
    if (!escrowManagerAddress || !adminKeyringId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const keyring = validateKeyring(adminKeyringId);
    const result = await api.bridge.setEscrowManager(escrowManagerAddress, keyring);
    
    res.json({ 
      message: 'Escrow Manager set successfully',
      result
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     HYPER VARA STREAMS API SERVER                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Vara RPC: ${VARA_RPC}`);
  console.log(`\n📚 API Documentation:`);
  console.log(`   POST /connect - Initialize connection`);
  console.log(`   POST /keyring/register - Register keyring`);
  console.log(`   GET  /keyring/list - List keyrings`);
  console.log(`   POST /usdc/mint - Mint tokens`);
  console.log(`   POST /usdc/transfer - Transfer tokens`);
  console.log(`   GET  /usdc/balance/:address - Get balance`);
  console.log(`   POST /escrow/create-project - Create project`);
  console.log(`   POST /escrow/fund-project - Fund project`);
  console.log(`   POST /escrow/select-developer - Select developer`);
  console.log(`   POST /escrow/apply-progress - Apply progress`);
  console.log(`   POST /escrow/mark-final-approved - Mark final approved`);
  console.log(`   POST /bridge/submit-attestation - Submit attestation`);
  console.log(`\n✅ Ready to accept requests!\n`);
});
