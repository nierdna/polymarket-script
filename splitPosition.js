#!/usr/bin/env node
/**
 * Split Position Script - Conditional Tokens (Simplified)
 * Split position với conditionId đã có sẵn
 * 
 * Usage: node splitPosition.js
 */

const { ethers } = require('ethers');
const {
  loadConfig,
  loadABIs,
  getGasOptions,
  validateConfig,
  setupContracts,
  checkCondition,
  getPartition,
  validatePartition,
  getTokenInfo,
} = require('./utils/common');

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║         SPLIT POSITION - CONDITIONAL TOKENS           ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Load config và ABIs
  const CONFIG = loadConfig();
  const { CTF_ABI, ERC20_ABI } = loadABIs();

  // Validate
  validateConfig(CONFIG);

  // Setup
  const { provider, wallet, ctf, collateral } = await setupContracts(CONFIG, CTF_ABI, ERC20_ABI);
  
  console.log("✓ Wallet:", wallet.address);
  console.log("✓ Condition ID:", CONFIG.CONDITION_ID);

  // Check condition
  const outcomeSlotCount = await checkCondition(ctf, CONFIG.CONDITION_ID);
  console.log("✓ Outcome slots:", outcomeSlotCount.toString());

  // Get partition
  const partition = getPartition(CONFIG, outcomeSlotCount);

  // Get token info
  const { decimals, symbol } = await getTokenInfo(collateral);
  const amount = ethers.utils.parseUnits(CONFIG.AMOUNT, decimals);

  console.log(`✓ Amount: ${CONFIG.AMOUNT} ${symbol}`);

  // Check balance
  const balance = await collateral.balanceOf(wallet.address);
  if (balance.lt(amount)) {
    console.error(`❌ Insufficient balance. Need: ${CONFIG.AMOUNT} ${symbol}`);
    process.exit(1);
  }

  // Validate partition
  validatePartition(partition, outcomeSlotCount);

  // Approve
  const allowance = await collateral.allowance(wallet.address, CONFIG.CTF_ADDRESS);
  if (allowance.lt(amount)) {
    console.log("🔓 Approving collateral...");
    const gasOptions = await getGasOptions(provider);
    const tx = await collateral.approve(
      CONFIG.CTF_ADDRESS,
      ethers.constants.MaxUint256,
      {
        ...gasOptions,
        gasLimit: 100000
      }
    );
    await tx.wait();
    console.log("✓ Approved");
  }

  // Split
  console.log("\n🎲 Splitting position...");
  try {
    const gasOptions = await getGasOptions(provider);
    const tx = await ctf.splitPosition(
      CONFIG.COLLATERAL_ADDRESS,
      CONFIG.PARENT_COLLECTION_ID,
      CONFIG.CONDITION_ID,
      partition,
      amount,
      {
        ...gasOptions,
        gasLimit: CONFIG.GAS_LIMIT
      }
    );
    console.log("   TX:", tx.hash);
    const receipt = await tx.wait();
    
    console.log("\n✅ Split successful!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas:", receipt.gasUsed.toString());
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.reason) console.error("   Reason:", error.reason);
    process.exit(1);
  }

  console.log();
}

main().catch(error => {
  console.error("❌ Error:", error);
  process.exit(1);
});
