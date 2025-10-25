#!/usr/bin/env node
/**
 * Hyper Vara Streams API
 * Complete gear.js wrapper for USDC Token, Escrow Manager, and Verification Bridge
 * 
 * Usage:
 *   const api = new HyperVaraStreamsAPI();
 *   await api.connect('wss://testnet.vara.network', { usdcToken: '0x...', escrowManager: '0x...', verificationBridge: '0x...' });
 *   await api.usdc.mint(recipientAddress, amount, adminKeyring);
 */

const { GearApi, GearKeyring, decodeAddress } = require('@gear-js/api');

// ============================================================================
// Helper Functions
// ============================================================================

function hexToBytes(hex) {
  // Remove 0x prefix if present
  hex = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function addressToBytes(address) {
  // Convert Vara address to 32-byte array
  const decoded = decodeAddress(address);
  return new Uint8Array(decoded);
}

function bytesToHex(bytes) {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function u128ToLeBytes(value) {
  // Convert u128 to 16-byte little-endian
  const bytes = new Uint8Array(16);
  let bigValue = BigInt(value);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number(bigValue & 0xFFn);
    bigValue >>= 8n;
  }
  return bytes;
}

function leBytesToU128(bytes) {
  // Convert 16-byte little-endian to u128
  let result = 0n;
  for (let i = 15; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function u16ToLeBytes(value) {
  const bytes = new Uint8Array(2);
  bytes[0] = value & 0xFF;
  bytes[1] = (value >> 8) & 0xFF;
  return bytes;
}

// ============================================================================
// Main API Class
// ============================================================================

class HyperVaraStreamsAPI {
  constructor() {
    this.api = null;
    this.contracts = {
      usdcToken: null,
      escrowManager: null,
      verificationBridge: null
    };
    
    // Sub-APIs
    this.usdc = null;
    this.escrow = null;
    this.bridge = null;
  }

  /**
   * Initialize connection to Vara Network
   * @param {string} providerUrl - WSS endpoint (default: testnet)
   * @param {object} contractAddresses - { usdcToken, escrowManager, verificationBridge }
   */
  async connect(providerUrl = 'wss://testnet.vara.network', contractAddresses = {}) {
    console.log('🔌 Connecting to Vara Network...');
    this.api = await GearApi.create({ providerAddress: providerUrl });
    
    this.contracts = contractAddresses;
    
    // Initialize sub-APIs
    this.usdc = new USDCTokenAPI(this);
    this.escrow = new EscrowManagerAPI(this);
    this.bridge = new VerificationBridgeAPI(this);
    
    console.log('✅ Connected to Vara Network');
    console.log(`   USDC Token: ${contractAddresses.usdcToken || 'Not set'}`);
    console.log(`   Escrow Manager: ${contractAddresses.escrowManager || 'Not set'}`);
    console.log(`   Verification Bridge: ${contractAddresses.verificationBridge || 'Not set'}`);
    
    return this;
  }

  /**
   * Create a keyring from seed/mnemonic
   */
  createKeyring(seed) {
    return GearKeyring.fromSeed(seed);
  }

  /**
   * Create keyring from JSON backup
   */
  async createKeyringFromJson(json, password) {
    return GearKeyring.fromJson(json, password);
  }

  /**
   * Send a message to a contract
   */
  async sendMessage(destination, payload, keyring, value = 0) {
    const gas = await this.api.program.calculateGas.handle(
      decodeAddress(keyring.address),
      destination,
      payload,
      value,
      false
    );

    const tx = this.api.message.send({
      destination,
      payload,
      gasLimit: gas.min_limit,
      value
    });

    return new Promise((resolve, reject) => {
      tx.signAndSend(keyring, ({ events, status }) => {
        console.log(`📡 Transaction status: ${status.type}`);
        
        if (status.isInBlock) {
          console.log(`✅ In block: ${status.asInBlock}`);
        }
        
        if (status.isFinalized) {
          let success = false;
          events.forEach(({ event }) => {
            if (this.api.events.system.ExtrinsicSuccess.is(event)) {
              success = true;
            } else if (this.api.events.system.ExtrinsicFailed.is(event)) {
              reject(new Error('Transaction failed'));
            }
          });
          
          if (success) {
            resolve({ 
              status: 'finalized', 
              blockHash: status.asFinalized.toHex() 
            });
          }
        }
      });
    });
  }

  /**
   * Read state from a contract
   */
  async readState(programId, payload) {
    const reply = await this.api.message.calculateReply({
      destination: programId,
      origin: decodeAddress('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'), // Alice default
      payload,
      gasLimit: 250000000000,
      value: 0
    });

    return reply.payload;
  }

  async disconnect() {
    if (this.api) {
      await this.api.disconnect();
      console.log('🔌 Disconnected from Vara Network');
    }
  }
}

// ============================================================================
// USDC Token Contract API
// ============================================================================

class USDCTokenAPI {
  constructor(parentApi) {
    this.parent = parentApi;
  }

  get contractAddress() {
    return this.parent.contracts.usdcToken;
  }

  /**
   * Mint new USDC tokens (admin only)
   * @param {string} toAddress - Recipient Vara address
   * @param {bigint|string} amount - Amount to mint
   * @param {object} adminKeyring - Admin keyring
   */
  async mint(toAddress, amount, adminKeyring) {
    if (!this.contractAddress) {
      throw new Error('USDC Token contract address not set');
    }

    console.log(`\n💰 Minting ${amount} USDC tokens to ${toAddress}...`);

    // Payload: [1, to_address(32 bytes), amount(16 bytes LE)]
    const payload = new Uint8Array(49);
    payload[0] = 1; // Action: MINT
    
    const toBytes = addressToBytes(toAddress);
    payload.set(toBytes, 1);
    
    const amountBytes = u128ToLeBytes(amount);
    payload.set(amountBytes, 33);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      adminKeyring
    );

    console.log('✅ Tokens minted successfully!');
    return result;
  }

  /**
   * Transfer USDC tokens
   * @param {string} toAddress - Recipient Vara address
   * @param {bigint|string} amount - Amount to transfer
   * @param {object} senderKeyring - Sender keyring
   */
  async transfer(toAddress, amount, senderKeyring) {
    if (!this.contractAddress) {
      throw new Error('USDC Token contract address not set');
    }

    console.log(`\n💸 Transferring ${amount} USDC tokens to ${toAddress}...`);

    // Payload: [2, to_address(32 bytes), amount(16 bytes LE)]
    const payload = new Uint8Array(49);
    payload[0] = 2; // Action: TRANSFER
    
    const toBytes = addressToBytes(toAddress);
    payload.set(toBytes, 1);
    
    const amountBytes = u128ToLeBytes(amount);
    payload.set(amountBytes, 33);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      senderKeyring
    );

    console.log('✅ Transfer successful!');
    return result;
  }

  /**
   * Get balance of an account
   * @param {string} accountAddress - Account Vara address
   */
  async balanceOf(accountAddress) {
    if (!this.contractAddress) {
      throw new Error('USDC Token contract address not set');
    }

    console.log(`\n🔍 Querying balance for ${accountAddress}...`);

    // Payload: [5, account_address(32 bytes)]
    const payload = new Uint8Array(33);
    payload[0] = 5; // Action: BALANCE_OF
    
    const accountBytes = addressToBytes(accountAddress);
    payload.set(accountBytes, 1);

    const response = await this.parent.readState(this.contractAddress, payload);
    
    // Response is 16 bytes representing u128
    const balance = leBytesToU128(new Uint8Array(response));
    
    console.log(`💰 Balance: ${balance}`);
    return balance;
  }
}

// ============================================================================
// Escrow Manager Contract API
// ============================================================================

class EscrowManagerAPI {
  constructor(parentApi) {
    this.parent = parentApi;
  }

  get contractAddress() {
    return this.parent.contracts.escrowManager;
  }

  /**
   * Create a new project
   * @param {bigint|string} budget - Total project budget
   * @param {array} milestones - [milestone1%, milestone2%, milestone3%]
   * @param {object} ownerKeyring - Project owner keyring
   */
  async createProject(budget, milestones, ownerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n📝 Creating project with budget ${budget}...`);

    // Payload: [1, budget(16 bytes LE), m1%(2 bytes), m2%(2 bytes), m3%(2 bytes)]
    const payload = new Uint8Array(23);
    payload[0] = 1; // Action: CREATE_PROJECT
    
    const budgetBytes = u128ToLeBytes(budget);
    payload.set(budgetBytes, 1);
    
    payload.set(u16ToLeBytes(milestones[0]), 17);
    payload.set(u16ToLeBytes(milestones[1]), 19);
    payload.set(u16ToLeBytes(milestones[2]), 21);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      ownerKeyring
    );

    console.log('✅ Project created!');
    return result;
  }

  /**
   * Fund the project (owner transfers USDC to escrow)
   * @param {object} ownerKeyring - Project owner keyring
   */
  async fundProject(ownerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n💵 Funding project...`);

    // Payload: [2]
    const payload = new Uint8Array([2]); // Action: FUND_PROJECT

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      ownerKeyring
    );

    console.log('✅ Project funded! (60% progress pool, 35% final pool, 5% fee)');
    return result;
  }

  /**
   * Select developer for the project
   * @param {string} developerAddress - Developer Vara address
   * @param {object} ownerKeyring - Project owner keyring
   */
  async selectDeveloper(developerAddress, ownerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n👨‍💻 Selecting developer ${developerAddress}...`);

    // Payload: [3, developer_address(32 bytes)]
    const payload = new Uint8Array(33);
    payload[0] = 3; // Action: SELECT_DEVELOPER
    
    const devBytes = addressToBytes(developerAddress);
    payload.set(devBytes, 1);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      ownerKeyring
    );

    console.log('✅ Developer selected!');
    return result;
  }

  /**
   * Apply progress update (called by authorized verifier)
   * @param {number} milestoneIndex - 1, 2, or 3
   * @param {number} percentComplete - Progress percentage (0-10000 bps)
   * @param {object} verifierKeyring - Verifier keyring
   */
  async applyProgress(milestoneIndex, percentComplete, verifierKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n📊 Applying progress: Milestone ${milestoneIndex} at ${percentComplete / 100}%...`);

    // Payload: [4, milestone_index(1 byte), percent(2 bytes LE)]
    const payload = new Uint8Array(4);
    payload[0] = 4; // Action: APPLY_PROGRESS
    payload[1] = milestoneIndex;
    
    const percentBytes = u16ToLeBytes(percentComplete);
    payload.set(percentBytes, 2);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      verifierKeyring
    );

    console.log('✅ Progress applied! Tokens released to developer.');
    return result;
  }

  /**
   * Mark final delivery as approved
   * @param {object} ownerKeyring - Project owner keyring
   */
  async markFinalApproved(ownerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n✅ Marking final delivery as approved...`);

    // Payload: [5]
    const payload = new Uint8Array([5]); // Action: MARK_FINAL_APPROVED

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      ownerKeyring
    );

    console.log('✅ Final 35% released to developer!');
    return result;
  }

  /**
   * Set authorized verifier (owner only)
   * @param {string} verifierAddress - Verifier Vara address (usually verification bridge)
   * @param {object} ownerKeyring - Project owner keyring
   */
  async setVerifier(verifierAddress, ownerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Escrow Manager contract address not set');
    }

    console.log(`\n🔐 Setting authorized verifier to ${verifierAddress}...`);

    // Payload: [6, verifier_address(32 bytes)]
    const payload = new Uint8Array(33);
    payload[0] = 6; // Action: SET_VERIFIER
    
    const verifierBytes = addressToBytes(verifierAddress);
    payload.set(verifierBytes, 1);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      ownerKeyring
    );

    console.log('✅ Verifier set!');
    return result;
  }
}

// ============================================================================
// Verification Bridge Contract API
// ============================================================================

class VerificationBridgeAPI {
  constructor(parentApi) {
    this.parent = parentApi;
  }

  get contractAddress() {
    return this.parent.contracts.verificationBridge;
  }

  /**
   * Add a relayer (admin only)
   * @param {number} relayerSlot - 1, 2, or 3
   * @param {string} relayerAddress - Relayer Vara address
   * @param {object} adminKeyring - Admin keyring
   */
  async setRelayer(relayerSlot, relayerAddress, adminKeyring) {
    if (!this.contractAddress) {
      throw new Error('Verification Bridge contract address not set');
    }

    console.log(`\n🔐 Setting relayer ${relayerSlot} to ${relayerAddress}...`);

    // Payload: [1, slot(1 byte), relayer_address(32 bytes)]
    const payload = new Uint8Array(34);
    payload[0] = 1; // Action: SET_RELAYER
    payload[1] = relayerSlot;
    
    const relayerBytes = addressToBytes(relayerAddress);
    payload.set(relayerBytes, 2);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      adminKeyring
    );

    console.log('✅ Relayer set!');
    return result;
  }

  /**
   * Submit attestation from Hyperliquid (relayer only)
   * @param {number} milestoneIndex - 1, 2, or 3
   * @param {number} percentComplete - Progress percentage (0-10000 bps)
   * @param {object} relayerKeyring - Relayer keyring
   */
  async submitAttestation(milestoneIndex, percentComplete, relayerKeyring) {
    if (!this.contractAddress) {
      throw new Error('Verification Bridge contract address not set');
    }

    console.log(`\n🌉 Submitting attestation: Milestone ${milestoneIndex} at ${percentComplete / 100}%...`);

    // Payload: [2, milestone_index(1 byte), percent(2 bytes LE)]
    const payload = new Uint8Array(4);
    payload[0] = 2; // Action: SUBMIT_ATTESTATION
    payload[1] = milestoneIndex;
    
    const percentBytes = u16ToLeBytes(percentComplete);
    payload.set(percentBytes, 2);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      relayerKeyring
    );

    console.log('✅ Attestation submitted and forwarded to Escrow Manager!');
    return result;
  }

  /**
   * Get last verified percentage for a milestone
   * @param {number} milestoneIndex - 1, 2, or 3
   */
  async getLastPercent(milestoneIndex) {
    if (!this.contractAddress) {
      throw new Error('Verification Bridge contract address not set');
    }

    console.log(`\n🔍 Querying last percent for milestone ${milestoneIndex}...`);

    // Payload: [3, milestone_index(1 byte)]
    const payload = new Uint8Array([3, milestoneIndex]);

    const response = await this.parent.readState(this.contractAddress, payload);
    
    // Response is 2 bytes representing u16
    const percent = (response[1] << 8) | response[0];
    
    console.log(`📊 Last verified: ${percent / 100}%`);
    return percent;
  }

  /**
   * Set escrow manager address (admin only)
   * @param {string} escrowManagerAddress - Escrow Manager contract address
   * @param {object} adminKeyring - Admin keyring
   */
  async setEscrowManager(escrowManagerAddress, adminKeyring) {
    if (!this.contractAddress) {
      throw new Error('Verification Bridge contract address not set');
    }

    console.log(`\n🔗 Setting Escrow Manager to ${escrowManagerAddress}...`);

    // Payload: [4, escrow_manager_address(32 bytes)]
    const payload = new Uint8Array(33);
    payload[0] = 4; // Action: SET_ESCROW
    
    const escrowBytes = addressToBytes(escrowManagerAddress);
    payload.set(escrowBytes, 1);

    const result = await this.parent.sendMessage(
      this.contractAddress,
      payload,
      adminKeyring
    );

    console.log('✅ Escrow Manager set!');
    return result;
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  HyperVaraStreamsAPI,
  helpers: {
    hexToBytes,
    bytesToHex,
    addressToBytes,
    u128ToLeBytes,
    leBytesToU128,
    u16ToLeBytes
  }
};
