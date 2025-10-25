# 🚀 Getting Started with Hyper Vara Streams

## ✅ What You Have

Your contracts are **already deployed** on Vara Testnet:

| Contract | Address | Status |
|----------|---------|--------|
| **USDC Token** | `0x4d0e258ccc...6424f6ebe` | ✅ Deployed |
| **Escrow Manager** | `0x62dcf755af...11399fb1` | ✅ Deployed |
| **Verification Bridge** | `0x073865f712...ead5442a` | ✅ Deployed |

**Your Account**: `5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp`

---

## ⚠️ Issue: No Testnet Tokens

The error you're seeing happens because **your account doesn't have testnet tokens** to pay for gas fees.

### Solution Options

#### **Option A: Get Testnet Tokens (Recommended for Production)**

1. Visit the **Vara Testnet Faucet**:
   - Go to: https://idea.gear-tech.io/
   - Connect your wallet or use the faucet
   - Request testnet tokens for: `5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp`

2. Once you have tokens, run:
   ```bash
   npm run workflow
   ```

#### **Option B: Use Test Accounts (Quick Testing)**

Test accounts like `//Alice`, `//Bob` already have testnet tokens. Let's test with them:

```bash
# Temporarily use Alice for testing
VARA_MNEMONIC="//Alice" npm run workflow
```

---

## 🎯 Quick Test (No Gas Needed)

To verify everything is set up correctly without needing tokens:

```bash
# Check connection and addresses
node test_simple.js
```

---

## 📋 Step-by-Step: First Run

### 1. Get Testnet Tokens

**Visit**: https://idea.gear-tech.io/programs

- Click "Connect" in top right
- Choose "Create Account" or import your mnemonic
- Use the faucet to get test tokens
- Send to: `5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp`

### 2. Verify You Have Tokens

```bash
# Check your balance
node -e "
const { GearApi } = require('@gear-js/api');
(async () => {
  const api = await GearApi.create();
  const balance = await api.balance.findOut('5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp');
  console.log('Balance:', balance.toString());
  await api.disconnect();
})();
"
```

### 3. Run the Workflow

```bash
npm run workflow
```

---

## 🔄 Alternative: Test with Built-in Accounts

If you just want to **test the system** without getting tokens:

### Update .env file:

```bash
# Use Alice (has testnet tokens by default)
VARA_MNEMONIC="//Alice"
```

Then run:
```bash
npm run workflow
```

---

## 🌐 Use the REST API Instead

The API server allows you to use **any account** by registering different keyrings:

### 1. Start Server

```bash
npm run server
```

### 2. Register Multiple Accounts

```bash
# Register your account
curl -X POST http://localhost:3000/keyring/register \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-account",
    "seed": "grunt amateur useless resemble soul winner color welcome sausage flee grief ring"
  }'

# Register Alice (has tokens)
curl -X POST http://localhost:3000/keyring/register \
  -H "Content-Type: application/json" \
  -d '{"id": "alice", "seed": "//Alice"}'
```

### 3. Use Alice for Gas-Heavy Operations

```bash
# Initialize connection
curl -X POST http://localhost:3000/connect

# Mint tokens using Alice (who has gas)
curl -X POST http://localhost:3000/usdc/mint \
  -H "Content-Type: application/json" \
  -d '{
    "toAddress": "5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp",
    "amount": "100000",
    "adminKeyringId": "alice"
  }'
```

---

## 📊 What Each Account Needs

| Role | Account | Needs Gas? | Purpose |
|------|---------|------------|---------|
| **Admin/Owner** | Your account or //Alice | ✅ Yes | Deploy, mint, create projects, approve |
| **Developer** | //Bob or any address | ❌ No | Receives payments (no transactions) |
| **Relayer** | //Charlie or any | ✅ Yes | Submit attestations |

**Key Insight**: Only accounts that **send transactions** need gas. Receiving tokens doesn't require gas.

---

## 🎬 Recommended Test Flow

### Quick Test (Use Alice):

```bash
# 1. Use Alice who has tokens
VARA_MNEMONIC="//Alice" npm run workflow
```

### Production Setup:

```bash
# 1. Get testnet tokens for your account
#    Visit: https://idea.gear-tech.io/

# 2. Verify balance (should be > 0)
# 3. Run with your mnemonic
npm run workflow
```

---

## 🐛 Troubleshooting

### Error: "Failed to get last message from the queue"
**Cause**: Account has no gas tokens  
**Fix**: Get testnet tokens or use `//Alice`

### Error: "Invalid empty address"
**Cause**: Keyring not created properly  
**Fix**: Make sure to `await` keyring creation (already fixed in code)

### Error: "Connection timeout"
**Cause**: Network issues  
**Fix**: Check internet connection, try again

---

## 💡 Tips

1. **For Testing**: Use `//Alice`, `//Bob`, `//Charlie` - they have testnet tokens
2. **For Production**: Get real testnet tokens for your mnemonic account
3. **Gas Costs**: Each transaction costs ~0.01 TVARA (testnet tokens)
4. **Faucet**: Request tokens at https://idea.gear-tech.io/

---

## ✅ Next Steps

Once you have tokens:

```bash
# Option 1: Run complete workflow
npm run workflow

# Option 2: Start API server for manual control
npm run server

# Option 3: View your contracts in explorer
open https://idea.gear-tech.io/programs/0x4d0e258ccc3962cddae2c1d3fc45dbd398cdba55cf19e82c103b9ee6424f6ebe
```

---

## 🎉 Summary

**You're almost there!** Just need to:
1. ✅ Get testnet tokens for `5GsXKGe5Ayw4u3obnUDXuQ6kg4atXuGAVGj6FfjMVb7smuAp`
2. ✅ Run `npm run workflow`
3. ✅ Watch your escrow system in action!

**Quick alternative**: Use `VARA_MNEMONIC="//Alice" npm run workflow` to test immediately.
