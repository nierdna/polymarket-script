#!/usr/bin/env node
/**
 * Redeem Position Script - Conditional Tokens (Simplified)
 * Redeem positions sau khi condition đã resolved
 * 
 * Usage: node redeemPosition.js
 */

const { ethers } = require('ethers');
const {
  loadConfig,
  loadABIs,
  getGasOptions,
  setupContracts,
  checkCondition,
  checkConditionResolved,
  getPayoutInfo,
  getTokenInfo,
  autoDetectIndexSets,
  validateIndexSets,
} = require('./utils/common');

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║       REDEEM POSITION - CONDITIONAL TOKENS            ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Load config và ABIs
  const CONFIG = loadConfig();
  const { CTF_ABI, ERC20_ABI } = loadABIs();

  // Validate (không cần AMOUNT cho redeem)
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ PRIVATE_KEY required");
    process.exit(1);
  }
  if (!CONFIG.CONDITION_ID) {
    console.error("❌ CONDITION_ID required");
    process.exit(1);
  }
  if (!CONFIG.COLLATERAL_ADDRESS) {
    console.error("❌ COLLATERAL_ADDRESS required");
    process.exit(1);
  }

  // Setup
  const { provider, wallet, ctf, collateral } = await setupContracts(CONFIG, CTF_ABI, ERC20_ABI);

  console.log("✓ Wallet:", wallet.address);
  console.log("✓ Condition ID:", CONFIG.CONDITION_ID);

  // Check condition prepared
  const outcomeSlotCount = await checkCondition(ctf, CONFIG.CONDITION_ID);
  console.log("✓ Outcome slots:", outcomeSlotCount.toString());

  // Check condition resolved
  const denominator = await checkConditionResolved(ctf, CONFIG.CONDITION_ID);
  console.log("✓ Condition resolved (denominator:", denominator.toString() + ")");

  // Get payout info
  const { numerators } = await getPayoutInfo(ctf, CONFIG.CONDITION_ID, outcomeSlotCount.toNumber());
  console.log("✓ Payout numerators:", numerators.map(n => n.toString()).join(", "));

  // Get token info
  const { decimals, symbol } = await getTokenInfo(collateral);

  // Auto-detect indexSets có balance
  let indexSets = CONFIG.INDEX_SETS;
  if (!indexSets || indexSets.length === 0) {
    console.log("\n🔍 Auto-detecting positions with balance...");
    indexSets = await autoDetectIndexSets(
      ctf,
      wallet,
      CONFIG.COLLATERAL_ADDRESS,
      CONFIG.PARENT_COLLECTION_ID,
      CONFIG.CONDITION_ID,
      outcomeSlotCount.toNumber()
    );
    if (indexSets.length === 0) {
      console.error("❌ No positions with balance found");
      process.exit(1);
    }
    console.log("✓ Found indexSets:", indexSets);
  } else {
    console.log("✓ Using indexSets:", indexSets);
  }

  // Validate indexSets
  validateIndexSets(indexSets, outcomeSlotCount.toNumber());

  // Check balances và tính expected payout
  console.log("\n💵 Checking position balances...");
  let totalExpectedPayout = ethers.BigNumber.from(0);
  
  for (const indexSet of indexSets) {
    const collectionId = await ctf.getCollectionId(
      CONFIG.PARENT_COLLECTION_ID,
      CONFIG.CONDITION_ID,
      indexSet
    );
    const positionId = await ctf.getPositionId(CONFIG.COLLATERAL_ADDRESS, collectionId);
    const balance = await ctf.balanceOf(wallet.address, positionId);
    
    if (balance.gt(0)) {
      // Tính payout numerator cho indexSet này
      let payoutNumerator = ethers.BigNumber.from(0);
      for (let j = 0; j < outcomeSlotCount.toNumber(); j++) {
        if (indexSet & (1 << j)) {
          payoutNumerator = payoutNumerator.add(numerators[j]);
        }
      }
      
      const expectedPayout = balance.mul(payoutNumerator).div(denominator);
      totalExpectedPayout = totalExpectedPayout.add(expectedPayout);
      
      console.log(`   IndexSet ${indexSet}: ${ethers.utils.formatUnits(balance, decimals)} → ${ethers.utils.formatUnits(expectedPayout, decimals)} ${symbol}`);
    }
  }

  if (totalExpectedPayout.eq(0)) {
    console.error("\n❌ No payout available (losing positions)");
    process.exit(1);
  }

  console.log(`\n   Total expected payout: ${ethers.utils.formatUnits(totalExpectedPayout, decimals)} ${symbol}`);

  // Check collateral balance before
  const collateralBalanceBefore = await collateral.balanceOf(wallet.address);
  console.log(`\n   Collateral balance (before): ${ethers.utils.formatUnits(collateralBalanceBefore, decimals)} ${symbol}`);

  // Redeem
  console.log("\n🎯 Redeeming positions...");
  try {
    const gasOptions = await getGasOptions(provider);
    const tx = await ctf.redeemPositions(
      CONFIG.COLLATERAL_ADDRESS,
      CONFIG.PARENT_COLLECTION_ID,
      CONFIG.CONDITION_ID,
      indexSets,
      {
        ...gasOptions,
        gasLimit: CONFIG.GAS_LIMIT
      }
    );
    console.log("   TX:", tx.hash);
    const receipt = await tx.wait();

    console.log("\n✅ Redeem successful!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas:", receipt.gasUsed.toString());

    // Check collateral balance after
    const collateralBalanceAfter = await collateral.balanceOf(wallet.address);
    const collateralDiff = collateralBalanceAfter.sub(collateralBalanceBefore);
    
    console.log(`\n   Collateral balance (after): ${ethers.utils.formatUnits(collateralBalanceAfter, decimals)} ${symbol}`);
    console.log(`   Received: +${ethers.utils.formatUnits(collateralDiff, decimals)} ${symbol}`);

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

