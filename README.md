# 🚀 Hyper Vara Streams - Quick Start Guide

## 📦 Your Deployed Contracts

✅ **All contracts are already deployed on Vara Testnet!**

| Contract | Program ID | Status |
|----------|-----------|--------|
| **USDC Token** | `0x4d0e258ccc3962cddae2c1d3fc45dbd398cdba55cf19e82c103b9ee6424f6ebe` | ✅ Live |
| **Escrow Manager** | `0x62dcf755afbf95e27f163c0687dd24d9950a2b7dfdefedf63a03d17111399fb1` | ✅ Live |
| **Verification Bridge** | `0x073865f712b3760e2a5ffbdfc91c44bf9ade6227230dd3239faa6accead5442a` | ✅ Live |

View contracts: [Vara Idea Explorer](https://idea.gear-tech.io/programs)

---

## 🏃 How to Run HVS

### Step 1: Install Dependencies

```bash
cd hyper_vara_streams_deployment
npm install
```

This installs:
- `@gear-js/api` - Vara Network SDK
- `express` - REST API framework

---

### Step 2: Choose Your Method

#### **Option A: Run Complete Workflow (Recommended for Testing)**

Execute the full project lifecycle automatically:

```bash
npm run workflow
```

**What it does:**
1. ✅ Mints USDC tokens
2. ✅ Creates a project with 3 milestones (30%, 30%, 40%)
3. ✅ Funds the escrow (60% progress, 35% final, 5% fee)
4. ✅ Selects a developer
5. ✅ Submits milestone progress via verification bridge
6. ✅ Releases payments progressively
7. ✅ Approves final delivery and releases final 35%

**Expected Output:**
```
╔════════════════════════════════════════════════════════════════╗
║     HYPER VARA STREAMS - COMPLETE WORKFLOW                     ║
╚════════════════════════════════════════════════════════════════╝

🔌 Connecting to Vara Network...
✅ Connected to Vara Network
   USDC Token: 0x4d0e258ccc...
   Escrow Manager: 0x62dcf755af...
   Verification Bridge: 0x073865f712...

👥 Participants:
   Project Owner: 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
   Developer: 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty
   Relayer: 5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y

======================================================================
STEP 1: Setup - Mint USDC Tokens
======================================================================
💰 Minting 100000 USDC tokens...
✅ Tokens minted successfully!
💰 Owner balance: 100000 USDC
...
```

---

#### **Option B: Run REST API Server (For Integration)**

Start the HTTP API server:

```bash
npm run server
```

Server starts on **http://localhost:3000**

**Available Endpoints:**

```bash
# System
GET  /health
GET  /contracts
POST /connect

# Keyring Management
POST /keyring/register
GET  /keyring/list

# USDC Token
POST /usdc/mint
POST /usdc/transfer
GET  /usdc/balance/:address

# Escrow Manager
POST /escrow/create-project
POST /escrow/fund-project
POST /escrow/select-developer
POST /escrow/apply-progress
POST /escrow/mark-final-approved
POST /escrow/set-verifier

# Verification Bridge
POST /bridge/set-relayer
POST /bridge/submit-attestation
GET  /bridge/last-percent/:milestoneIndex
POST /bridge/set-escrow-manager
```

---

### Step 3: Test the API (curl examples)

#### 1. Initialize Connection

```bash
curl -X POST http://localhost:3000/connect
```

#### 2. Register Keyrings

```bash
# Register project owner
curl -X POST http://localhost:3000/keyring/register \
  -H "Content-Type: application/json" \
  -d '{"id": "owner", "seed": "//Alice"}'

# Register developer
curl -X POST http://localhost:3000/keyring/register \
  -H "Content-Type: application/json" \
  -d '{"id": "developer", "seed": "//Bob"}'

# Register relayer
curl -X POST http://localhost:3000/keyring/register \
  -H "Content-Type: application/json" \
  -d '{"id": "relayer", "seed": "//Charlie"}'
```

#### 3. Mint USDC Tokens

```bash
curl -X POST http://localhost:3000/usdc/mint \
  -H "Content-Type: application/json" \
  -d '{
    "toAddress": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "amount": "100000",
    "adminKeyringId": "owner"
  }'
```

#### 4. Check Balance

```bash
curl http://localhost:3000/usdc/balance/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
```

#### 5. Create Project

```bash
curl -X POST http://localhost:3000/escrow/create-project \
  -H "Content-Type: application/json" \
  -d '{
    "budget": "100000",
    "milestones": [3000, 3000, 4000],
    "ownerKeyringId": "owner"
  }'
```

#### 6. Submit Milestone Progress

```bash
curl -X POST http://localhost:3000/bridge/submit-attestation \
  -H "Content-Type: application/json" \
  -d '{
    "milestoneIndex": 1,
    "percentComplete": 10000,
    "relayerKeyringId": "relayer"
  }'
```

---

## 📚 Using the JavaScript SDK

### Basic Usage

```javascript
const { HyperVaraStreamsAPI } = require('./hyper_vara_streams_api');

async function main() {
  // Initialize API
  const api = new HyperVaraStreamsAPI();
  
  await api.connect('wss://testnet.vara.network', {
    usdcToken: '0x4d0e258ccc3962cddae2c1d3fc45dbd398cdba55cf19e82c103b9ee6424f6ebe',
    escrowManager: '0x62dcf755afbf95e27f163c0687dd24d9950a2b7dfdefedf63a03d17111399fb1',
    verificationBridge: '0x073865f712b3760e2a5ffbdfc91c44bf9ade6227230dd3239faa6accead5442a'
  });

  // Create keyring
  const keyring = api.createKeyring('//Alice');
  
  // Mint tokens
  await api.usdc.mint(keyring.address, 100000n, keyring);
  
  // Check balance
  const balance = await api.usdc.balanceOf(keyring.address);
  console.log(`Balance: ${balance}`);
  
  // Disconnect
  await api.disconnect();
}

main().catch(console.error);
```

### USDC Token Operations

```javascript
// Mint tokens
await api.usdc.mint(recipientAddress, 50000n, adminKeyring);

// Transfer tokens
await api.usdc.transfer(toAddress, 25000n, senderKeyring);

// Check balance
const balance = await api.usdc.balanceOf(address);
```

### Escrow Manager Operations

```javascript
// Create project
await api.escrow.createProject(
  100000n,              // Budget
  [3000, 3000, 4000],   // Milestones: 30%, 30%, 40%
  ownerKeyring
);

// Fund project
await api.usdc.transfer(escrowAddress, 100000n, ownerKeyring);
await api.escrow.fundProject(ownerKeyring);

// Select developer
await api.escrow.selectDeveloper(developerAddress, ownerKeyring);

// Set verifier (verification bridge)
await api.escrow.setVerifier(bridgeAddress, ownerKeyring);

// Mark final approved
await api.escrow.markFinalApproved(ownerKeyring);
```

### Verification Bridge Operations

```javascript
// Set relayer
await api.bridge.setRelayer(1, relayerAddress, adminKeyring);

// Set escrow manager
await api.bridge.setEscrowManager(escrowAddress, adminKeyring);

// Submit attestation (triggers payment)
await api.bridge.submitAttestation(
  1,      // Milestone index
  10000,  // 100% complete (in basis points)
  relayerKeyring
);

// Get last verified percent
const percent = await api.bridge.getLastPercent(1);
console.log(`Milestone 1: ${percent / 100}% complete`);
```

---

## 🎯 Complete Project Flow

### 1. **Setup Phase**
```bash
# Owner mints USDC tokens
api.usdc.mint(ownerAddress, budget, ownerKeyring)

# Owner creates project
api.escrow.createProject(budget, [3000, 3000, 4000], ownerKeyring)

# Owner sets verification bridge as verifier
api.escrow.setVerifier(bridgeAddress, ownerKeyring)

# Admin configures bridge
api.bridge.setRelayer(1, relayerAddress, adminKeyring)
api.bridge.setEscrowManager(escrowAddress, adminKeyring)
```

### 2. **Funding Phase**
```bash
# Owner transfers USDC to escrow
api.usdc.transfer(escrowAddress, budget, ownerKeyring)

# Owner calls fund_project (splits into pools)
api.escrow.fundProject(ownerKeyring)
# Result: 60% → Progress Pool, 35% → Final Pool, 5% → Treasury
```

### 3. **Development Phase**
```bash
# Owner selects developer
api.escrow.selectDeveloper(developerAddress, ownerKeyring)

# Developer works on milestones...
```

### 4. **Progress & Payment Phase**
```bash
# Relayer submits milestone 1 completion (30%)
api.bridge.submitAttestation(1, 10000, relayerKeyring)
# → Developer receives 30% from progress pool

# Relayer submits milestone 2 completion (30%)
api.bridge.submitAttestation(2, 10000, relayerKeyring)
# → Developer receives another 30% from progress pool

# Relayer submits milestone 3 progress (20% of 40%)
api.bridge.submitAttestation(3, 5000, relayerKeyring)
# → Developer receives 20% from progress pool

# Relayer submits milestone 3 completion (remaining 20%)
api.bridge.submitAttestation(3, 10000, relayerKeyring)
# → Developer receives final 20% from progress pool
# → Total from progress pool: 100% (of 60% budget = 60% of total)
```

### 5. **Final Delivery Phase**
```bash
# Owner approves final delivery
api.escrow.markFinalApproved(ownerKeyring)
# → Developer receives final 35% pool

# Final distribution:
# Developer: 95% (60% progressive + 35% final)
# Treasury: 5% (platform fee)
```

---

## 🔧 Troubleshooting

### Issue: "API not initialized"
**Solution:** Call `/connect` endpoint first or ensure `api.connect()` is called

### Issue: "Keyring not found"
**Solution:** Register keyring first using `/keyring/register`

### Issue: "Insufficient balance"
**Solution:** Mint tokens first using `api.usdc.mint()`

### Issue: "Transaction failed"
**Solution:** Check gas limits, ensure correct permissions (admin/owner/verifier)

---

## 📊 Payment Distribution Example

**Project Budget: 100,000 USDC**

```
Initial Split (after funding):
├─ Progress Pool (60%): 60,000 USDC
├─ Final Pool (35%):    35,000 USDC
└─ Treasury Fee (5%):    5,000 USDC

Milestone Releases:
├─ Milestone 1 (30%): 30,000 USDC → Developer
├─ Milestone 2 (30%): 30,000 USDC → Developer
└─ Milestone 3 (40%): 40,000 USDC → Developer (split: 20k + 20k)

Final Approval:
└─ Final Pool (35%):  35,000 USDC → Developer

Total Developer Earnings: 95,000 USDC (95%)
Total Treasury Fee:        5,000 USDC (5%)
```

---

## 📁 File Structure

```
hyper_vara_streams_deployment/
├── DEPLOYMENT_MANIFEST.json          # Contract addresses
├── package.json                      # NPM scripts
├── hyper_vara_streams_api.js         # JavaScript SDK
├── hyper_vara_streams_server.js      # REST API server
├── complete_workflow.js              # Full workflow example
├── usdc_token/
│   ├── usdc_token.rs                 # Source code
│   └── usdc_token.wasm               # Compiled WASM
├── escrow_manager/
│   ├── escrow_manager.rs             # Source code
│   └── escrow_manager.wasm           # Compiled WASM
└── verification_bridge/
    ├── verification_bridge.rs        # Source code
    └── verification_bridge.wasm      # Compiled WASM
```

---

## 🌐 Explorer Links

- **USDC Token**: https://idea.gear-tech.io/programs/0x4d0e258ccc3962cddae2c1d3fc45dbd398cdba55cf19e82c103b9ee6424f6ebe
- **Escrow Manager**: https://idea.gear-tech.io/programs/0x62dcf755afbf95e27f163c0687dd24d9950a2b7dfdefedf63a03d17111399fb1
- **Verification Bridge**: https://idea.gear-tech.io/programs/0x073865f712b3760e2a5ffbdfc91c44bf9ade6227230dd3239faa6accead5442a

---

## 🎉 Next Steps

1. ✅ **Test the workflow**: `npm run workflow`
2. ✅ **Start API server**: `npm run server`
3. ✅ **Integrate with frontend**: Use the JavaScript SDK
4. ✅ **Connect Hyperliquid**: Configure relayers to submit attestations
5. ✅ **Production deployment**: Use secure keyring management (hardware wallets, KMS)

---

## 💡 Tips

- **Basis Points**: Percentages are in basis points (10000 = 100%, 5000 = 50%)
- **Monotonic Progress**: Milestones can only move forward, never backward
- **Multi-relayer**: Support up to 3 relayers for decentralization
- **Gas Estimation**: SDK automatically calculates gas limits
- **Security**: Never hardcode seeds in production, use environment variables

---

## 📞 Support

For issues or questions:
- Check the [Vara Documentation](https://wiki.vara-network.io/)
- View contract source code in respective directories
- Test with small amounts first

**Happy Building! 🚀**
