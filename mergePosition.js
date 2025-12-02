#!/usr/bin/env node
/**
 * Merge Position Script - Conditional Tokens (Simplified)
 * Merge các positions để lấy lại collateral hoặc parent position
 * 
 * Usage: node mergePosition.js
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
  calculatePositionIds,
} = require('./utils/common');

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║         MERGE POSITION - CONDITIONAL TOKENS           ║");
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

  console.log(`✓ Amount to merge: ${CONFIG.AMOUNT} ${symbol}`);

  // Validate partition
  const { fullIndexSet, freeIndexSet } = validatePartition(partition, outcomeSlotCount);

  // Check position balances
  console.log("\n💵 Checking position balances...");
  const positionIds = await calculatePositionIds(
    ctf,
    CONFIG.COLLATERAL_ADDRESS,
    CONFIG.PARENT_COLLECTION_ID,
    CONFIG.CONDITION_ID,
    partition
  );

  for (let i = 0; i < partition.length; i++) {
    const indexSet = partition[i];
    const positionId = positionIds[i];
    const balance = await ctf.balanceOf(wallet.address, positionId);
    console.log(`   Position ${indexSet}: ${ethers.utils.formatUnits(balance, decimals)}`);
    
    if (balance.lt(amount)) {
      console.error(`❌ Insufficient balance in position ${indexSet}`);
      console.error(`   Need: ${ethers.utils.formatUnits(amount, decimals)}`);
      console.error(`   Have: ${ethers.utils.formatUnits(balance, decimals)}`);
      process.exit(1);
    }
  }

  // Check collateral balance before merge
  const collateralBalanceBefore = await collateral.balanceOf(wallet.address);
  console.log(`\n   Collateral balance (before): ${ethers.utils.formatUnits(collateralBalanceBefore, decimals)} ${symbol}`);

  // Merge
  console.log("\n🔗 Merging positions...");
  try {
    const gasOptions = await getGasOptions(provider);
    const tx = await ctf.mergePositions(
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

    console.log("\n✅ Merge successful!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas:", receipt.gasUsed.toString());

    // Check collateral balance after merge
    const collateralBalanceAfter = await collateral.balanceOf(wallet.address);
    const collateralDiff = collateralBalanceAfter.sub(collateralBalanceBefore);
    
    console.log(`\n   Collateral balance (after): ${ethers.utils.formatUnits(collateralBalanceAfter, decimals)} ${symbol}`);
    console.log(`   Received: +${ethers.utils.formatUnits(collateralDiff, decimals)} ${symbol}`);

    // Note về kết quả
    if (CONFIG.PARENT_COLLECTION_ID === ethers.constants.HashZero && freeIndexSet === 0) {
      console.log("\n💡 Merged to collateral token");
    } else if (freeIndexSet === 0) {
      console.log("\n💡 Merged to parent position");
    } else {
      console.log(`\n💡 Merged to position (remaining index set: ${fullIndexSet ^ freeIndexSet})`);
    }

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
