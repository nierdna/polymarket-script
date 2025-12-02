/**
 * Common utilities cho Conditional Tokens scripts
 * Chứa các shared functions để tránh duplicate code
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Load config với defaults
function loadConfig() {
  try { require('dotenv').config(); } catch (e) { }
  
  return {
    RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com',
    PRIVATE_KEY: process.env.PRIVATE_KEY || process.env.PK,
    CTF_ADDRESS: process.env.CTF_ADDRESS || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    COLLATERAL_ADDRESS: process.env.COLLATERAL_ADDRESS,
    CONDITION_ID: process.env.CONDITION_ID,
    AMOUNT: process.env.AMOUNT || '100',
    PARTITION: process.env.PARTITION ? JSON.parse(process.env.PARTITION) : null,
    PARENT_COLLECTION_ID: process.env.PARENT_COLLECTION_ID || ethers.constants.HashZero,
    GAS_LIMIT: parseInt(process.env.GAS_LIMIT || '300000'),
  };
}

// Load ABI từ files
function loadABIs() {
  const CTF_ABI = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'abis', 'ConditionalTokens.json'), 'utf8')
  ).abi;
  
  const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
  ];
  
  return { CTF_ABI, ERC20_ABI };
}

// Helper: Tự động tạo partition
function generatePartition(outcomeSlotCount) {
  return Array.from({ length: outcomeSlotCount }, (_, i) => 1 << i);
}

// Helper: Lấy gas options cho EIP-1559
async function getGasOptions(provider) {
  const feeData = await provider.getFeeData();
  const minPriorityFee = ethers.utils.parseUnits('25', 'gwei');
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.gt(minPriorityFee)
    ? feeData.maxPriorityFeePerGas
    : minPriorityFee;
    
  let maxFeePerGas;
  if (feeData.maxFeePerGas) {
    maxFeePerGas = feeData.maxFeePerGas.gt(maxPriorityFeePerGas)
      ? feeData.maxFeePerGas
      : maxPriorityFeePerGas.mul(2);
  } else if (feeData.gasPrice) {
    maxFeePerGas = feeData.gasPrice.mul(2);
  } else {
    maxFeePerGas = maxPriorityFeePerGas.mul(2);
  }
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

// Validate config cơ bản
function validateConfig(config) {
  if (!config.PRIVATE_KEY) {
    console.error("❌ PRIVATE_KEY required");
    process.exit(1);
  }
  if (!config.CONDITION_ID) {
    console.error("❌ CONDITION_ID required");
    process.exit(1);
  }
  if (!config.COLLATERAL_ADDRESS) {
    console.error("❌ COLLATERAL_ADDRESS required");
    process.exit(1);
  }
}

// Setup provider, wallet và contracts
async function setupContracts(config, CTF_ABI, ERC20_ABI) {
  const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
  const ctf = new ethers.Contract(config.CTF_ADDRESS, CTF_ABI, wallet);
  const collateral = new ethers.Contract(config.COLLATERAL_ADDRESS, ERC20_ABI, wallet);
  
  return { provider, wallet, ctf, collateral };
}

// Check condition và lấy outcomeSlotCount
async function checkCondition(ctf, conditionId) {
  const outcomeSlotCount = await ctf.getOutcomeSlotCount(conditionId);
  if (outcomeSlotCount.eq(0)) {
    console.error("❌ Condition not found or not prepared");
    process.exit(1);
  }
  return outcomeSlotCount;
}

// Get partition (tự động hoặc từ config)
function getPartition(config, outcomeSlotCount) {
  let partition = config.PARTITION;
  if (!partition) {
    partition = generatePartition(outcomeSlotCount.toNumber());
    console.log("✓ Auto partition:", partition);
  }
  return partition;
}

// Validate partition
function validatePartition(partition, outcomeSlotCount) {
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
  
  return { fullIndexSet, freeIndexSet };
}

// Get token info (decimals, symbol)
async function getTokenInfo(collateral) {
  const decimals = await collateral.decimals();
  const symbol = await collateral.symbol();
  return { decimals, symbol };
}

// Calculate position IDs cho partition
async function calculatePositionIds(ctf, collateralAddress, parentCollectionId, conditionId, partition) {
  const positionIds = [];
  for (const indexSet of partition) {
    const collectionId = await ctf.getCollectionId(parentCollectionId, conditionId, indexSet);
    const positionId = await ctf.getPositionId(collateralAddress, collectionId);
    positionIds.push(positionId);
  }
  return positionIds;
}

module.exports = {
  loadConfig,
  loadABIs,
  generatePartition,
  getGasOptions,
  validateConfig,
  setupContracts,
  checkCondition,
  getPartition,
  validatePartition,
  getTokenInfo,
  calculatePositionIds,
};

