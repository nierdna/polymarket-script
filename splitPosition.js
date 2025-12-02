#!/usr/bin/env node
/**
 * Split Position Script - Conditional Tokens (Simplified)
 * Split position với conditionId đã có sẵn
 * 
 * Usage: node splitPosition.js
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

try { require('dotenv').config(); } catch (e) { }

const CONFIG = {
  RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com',
    PRIVATE_KEY: process.env.PRIVATE_KEY || process.env.PK,
  CTF_ADDRESS: process.env.CTF_ADDRESS || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  COLLATERAL_ADDRESS: process.env.COLLATERAL_ADDRESS,
  CONDITION_ID: process.env.CONDITION_ID,
  AMOUNT: process.env.AMOUNT || '100',
  PARTITION: process.env.PARTITION ? JSON.parse(process.env.PARTITION) : null, // null = auto generate
  PARENT_COLLECTION_ID: process.env.PARENT_COLLECTION_ID || ethers.constants.HashZero,
    GAS_LIMIT: parseInt(process.env.GAS_LIMIT || '300000'),
};

const CTF_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'abis', 'ConditionalTokens.json'), 'utf8')).abi;
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// Helper: Tự động tạo partition
function generatePartition(outcomeSlotCount) {
  return Array.from({ length: outcomeSlotCount }, (_, i) => 1 << i);
}

// Helper: Lấy gas options cho EIP-1559
async function getGasOptions(provider) {
  const feeData = await provider.getFeeData();
  const minPriorityFee = ethers.utils.parseUnits('25', 'gwei'); // Polygon minimum

  // Đảm bảo maxPriorityFeePerGas >= 25 Gwei
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.gt(minPriorityFee)
    ? feeData.maxPriorityFeePerGas
    : minPriorityFee;

  // Tính maxFeePerGas
  // Nếu có maxFeePerGas từ feeData, dùng nó nhưng đảm bảo >= maxPriorityFeePerGas
  // Nếu không, tính từ gasPrice hoặc tạo một giá hợp lý
  let maxFeePerGas;
  if (feeData.maxFeePerGas) {
    // maxFeePerGas phải >= maxPriorityFeePerGas
    maxFeePerGas = feeData.maxFeePerGas.gt(maxPriorityFeePerGas)
      ? feeData.maxFeePerGas
      : maxPriorityFeePerGas.mul(2);
  } else if (feeData.gasPrice) {
    // Fallback: dùng gasPrice * 2
    maxFeePerGas = feeData.gasPrice.mul(2);
  } else {
    // Fallback cuối cùng: maxPriorityFeePerGas * 2
    maxFeePerGas = maxPriorityFeePerGas.mul(2);
  }

  return {
    maxPriorityFeePerGas,
    maxFeePerGas
  };
}

async function main() {
    console.log("╔═══════════════════════════════════════════════════════╗");
    console.log("║         SPLIT POSITION - CONDITIONAL TOKENS           ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Validate
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
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
  const ctf = new ethers.Contract(CONFIG.CTF_ADDRESS, CTF_ABI, wallet);
  const collateral = new ethers.Contract(CONFIG.COLLATERAL_ADDRESS, ERC20_ABI, wallet);
    
  console.log("✓ Wallet:", wallet.address);
  console.log("✓ Condition ID:", CONFIG.CONDITION_ID);

  // Check condition
  const outcomeSlotCount = await ctf.getOutcomeSlotCount(CONFIG.CONDITION_ID);
  if (outcomeSlotCount.eq(0)) {
    console.error("❌ Condition not found or not prepared");
        process.exit(1);
    }
  console.log("✓ Outcome slots:", outcomeSlotCount.toString());

  // Get partition
  let partition = CONFIG.PARTITION;
  if (!partition) {
    partition = generatePartition(outcomeSlotCount.toNumber());
    console.log("✓ Auto partition:", partition);
    }

  // Get token info
  const decimals = await collateral.decimals();
  const symbol = await collateral.symbol();
  const amount = ethers.utils.parseUnits(CONFIG.AMOUNT, decimals);

  console.log(`✓ Amount: ${CONFIG.AMOUNT} ${symbol}`);

  // Check balance
  const balance = await collateral.balanceOf(wallet.address);
  if (balance.lt(amount)) {
    console.error(`❌ Insufficient balance. Need: ${CONFIG.AMOUNT} ${symbol}`);
    process.exit(1);
  }

    // Validate partition
  const fullIndexSet = (1 << outcomeSlotCount.toNumber()) - 1;
    let freeIndexSet = fullIndexSet;
  for (const indexSet of partition) {
        if (indexSet <= 0 || indexSet >= fullIndexSet) {
          console.error(`❌ Invalid index set: ${indexSet}`);
            process.exit(1);
        }
        if ((indexSet & freeIndexSet) !== indexSet) {
          console.error(`❌ Partition not disjoint`);
            process.exit(1);
        }
        freeIndexSet ^= indexSet;
    }

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
