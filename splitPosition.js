#!/usr/bin/env node
/**
 * Split Position Script - Conditional Tokens
 * 
 * Script này sẽ:
 * 1. Prepare condition nếu chưa có
 * 2. Check collateral balance
 * 3. Approve collateral token cho CTF contract
 * 4. Call CTF.splitPosition() để split collateral thành positions
 * 5. Verify token balances sau khi split
 * 
 * Usage:
 *   node splitPosition.js
 * 
 * Requirements:
 *   - Cấu hình trong CONFIG object hoặc environment variables
 *   - Wallet phải có collateral token
 *   - Cần ETH để trả gas
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Load environment variables (optional)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv is optional
}

// Configuration
// Có thể override bằng environment variables
const CONFIG = {
    // Network & Wallet
    RPC_URL: process.env.RPC_URL || 'https://sepolia.base.org',
    PRIVATE_KEY: process.env.PRIVATE_KEY || process.env.PK,
    
    // Contract Addresses
    CTF_ADDRESS: process.env.CTF_ADDRESS || process.env.CTF || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    COLLATERAL_ADDRESS: process.env.COLLATERAL_ADDRESS || process.env.COLLATERAL || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    
    // Condition Parameters
    ORACLE: process.env.ORACLE || '', // Address của oracle (có thể dùng wallet address)
    QUESTION_ID: process.env.QUESTION_ID || ethers.utils.formatBytes32String('TEST_MARKET_1'),
    OUTCOME_SLOT_COUNT: parseInt(process.env.OUTCOME_SLOT_COUNT || '2'), // Binary market (YES/NO)
    
    // Split Parameters
    PARTITION: process.env.PARTITION ? JSON.parse(process.env.PARTITION) : [1, 2], // [0b01, 0b10] = [YES, NO]
    AMOUNT: process.env.AMOUNT || '100', // Amount in token units (will be converted with decimals)
    PARENT_COLLECTION_ID: process.env.PARENT_COLLECTION_ID || ethers.constants.HashZero, // bytes32(0) nếu split từ collateral
    
    // Gas
    GAS_LIMIT: parseInt(process.env.GAS_LIMIT || '300000'),
};

// Load ABI
const CTF_ABI = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'abis', 'ConditionalTokens.json'), 'utf8')
).abi;

// ERC20 ABI (minimal)
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)"
];

async function main() {
    console.log("╔═══════════════════════════════════════════════════════╗");
    console.log("║         SPLIT POSITION - CONDITIONAL TOKENS           ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");

    // Validate configuration
    if (!CONFIG.PRIVATE_KEY) {
        console.error("❌ Error: PRIVATE_KEY not found in environment or CONFIG");
        console.error("   Set PRIVATE_KEY in environment or update CONFIG.PRIVATE_KEY");
        process.exit(1);
    }

    if (!CONFIG.ORACLE) {
        console.warn("⚠️  Warning: ORACLE not set, will use wallet address as oracle");
    }

    // Setup provider and wallet
    console.log("📡 Connecting to network...");
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    console.log("✓ Connected to:", CONFIG.RPC_URL);
    console.log("✓ Wallet address:", wallet.address);
    
    // Use wallet address as oracle if not specified
    const oracle = CONFIG.ORACLE || wallet.address;
    console.log("✓ Oracle address:", oracle);
    
    const ethBalance = await wallet.getBalance();
    console.log("✓ ETH Balance:", ethers.utils.formatEther(ethBalance), "ETH");
    
    if (ethBalance.eq(0)) {
        console.error("\n❌ Error: No ETH balance for gas");
        process.exit(1);
    }

    // Connect to contracts
    console.log("\n📝 Connecting to contracts...");
    const ctf = new ethers.Contract(CONFIG.CTF_ADDRESS, CTF_ABI, wallet);
    const collateral = new ethers.Contract(CONFIG.COLLATERAL_ADDRESS, ERC20_ABI, wallet);
    
    console.log("✓ CTF Contract:", CONFIG.CTF_ADDRESS);
    console.log("✓ Collateral Token:", CONFIG.COLLATERAL_ADDRESS);

    // Get collateral token info
    let decimals, symbol, tokenName;
    try {
        decimals = await collateral.decimals();
        symbol = await collateral.symbol();
        tokenName = await collateral.name();
        console.log(`✓ Token: ${tokenName} (${symbol}, ${decimals} decimals)`);
    } catch (error) {
        console.warn("⚠️  Warning: Could not get token info, assuming 18 decimals");
        decimals = 18;
        symbol = "TOKEN";
        tokenName = "Collateral Token";
    }

    // Parse amount with correct decimals
    const amount = ethers.utils.parseUnits(CONFIG.AMOUNT, decimals);
    console.log(`✓ Amount to split: ${CONFIG.AMOUNT} ${symbol}`);

    // Calculate condition ID
    console.log("\n🔢 Calculating condition ID...");
    const conditionId = await ctf.getConditionId(
        oracle,
        CONFIG.QUESTION_ID,
        CONFIG.OUTCOME_SLOT_COUNT
    );
    console.log("✓ Condition ID:", conditionId);

    // Check condition status
    console.log("\n📋 Checking condition status...");
    const outcomeSlotCount = await ctf.getOutcomeSlotCount(conditionId);
    
    if (outcomeSlotCount.eq(0)) {
        console.log("⚠️  Condition not prepared yet. Preparing condition...");
        
        try {
            const prepareTx = await ctf.prepareCondition(
                oracle,
                CONFIG.QUESTION_ID,
                CONFIG.OUTCOME_SLOT_COUNT,
                {
                    gasLimit: 100000
                }
            );
            
            console.log("   Transaction sent:", prepareTx.hash);
            console.log("   Waiting for confirmation...");
            
            await prepareTx.wait();
            console.log("✓ Condition prepared successfully!");
        } catch (error) {
            console.error("\n❌ Error preparing condition:", error.message);
            if (error.reason) {
                console.error("   Reason:", error.reason);
            }
            process.exit(1);
        }
    } else {
        console.log("✓ Condition already prepared");
        console.log("   Outcome slots:", outcomeSlotCount.toString());
    }

    // Check collateral balance
    console.log("\n💵 Checking collateral balance...");
    const collateralBalance = await collateral.balanceOf(wallet.address);
    console.log(`   Current balance: ${ethers.utils.formatUnits(collateralBalance, decimals)} ${symbol}`);
    
    if (collateralBalance.lt(amount)) {
        console.error(`\n❌ Error: Insufficient ${symbol} balance`);
        console.error(`   Need: ${ethers.utils.formatUnits(amount, decimals)} ${symbol}`);
        console.error(`   Have: ${ethers.utils.formatUnits(collateralBalance, decimals)} ${symbol}`);
        process.exit(1);
    }
    console.log("✓ Sufficient balance");

    // Validate partition
    console.log("\n✅ Validating partition...");
    if (!Array.isArray(CONFIG.PARTITION) || CONFIG.PARTITION.length < 2) {
        console.error("❌ Error: Partition must be an array with at least 2 elements");
        console.error("   Example: [1, 2] for binary market (YES, NO)");
        process.exit(1);
    }
    
    const fullIndexSet = (1 << CONFIG.OUTCOME_SLOT_COUNT) - 1;
    let freeIndexSet = fullIndexSet;
    
    for (const indexSet of CONFIG.PARTITION) {
        if (indexSet <= 0 || indexSet >= fullIndexSet) {
            console.error(`❌ Error: Invalid index set ${indexSet}`);
            console.error(`   Index set must be between 1 and ${fullIndexSet - 1}`);
            process.exit(1);
        }
        if ((indexSet & freeIndexSet) !== indexSet) {
            console.error(`❌ Error: Partition not disjoint. Index set ${indexSet} overlaps`);
            process.exit(1);
        }
        freeIndexSet ^= indexSet;
    }
    
    console.log("✓ Partition valid:", CONFIG.PARTITION);
    console.log(`   Full index set: ${fullIndexSet} (0b${fullIndexSet.toString(2)})`);
    console.log(`   Free index set: ${freeIndexSet} (0b${freeIndexSet.toString(2)})`);

    // Calculate position IDs (for verification later)
    console.log("\n🔍 Calculating position IDs...");
    
    const positionIds = [];
    for (const indexSet of CONFIG.PARTITION) {
        const collectionId = await ctf.getCollectionId(
            CONFIG.PARENT_COLLECTION_ID,
            conditionId,
            indexSet
        );
        const positionId = await ctf.getPositionId(CONFIG.COLLATERAL_ADDRESS, collectionId);
        positionIds.push(positionId);
        console.log(`   Index ${indexSet} → Position ID: ${positionId.toString()}`);
    }

    // Check current token balances (before split)
    console.log("\n📊 Current token balances (before split):");
    const balancesBefore = {};
    for (let i = 0; i < CONFIG.PARTITION.length; i++) {
        const balance = await ctf.balanceOf(wallet.address, positionIds[i]);
        balancesBefore[CONFIG.PARTITION[i]] = balance;
        console.log(`   Position ${CONFIG.PARTITION[i]}: ${ethers.utils.formatUnits(balance, decimals)}`);
    }

    // Step 1: Approve collateral for CTF contract
    console.log("\n🔓 Step 1: Approving collateral for CTF contract...");
    
    const currentAllowance = await collateral.allowance(wallet.address, CONFIG.CTF_ADDRESS);
    console.log(`   Current allowance: ${ethers.utils.formatUnits(currentAllowance, decimals)} ${symbol}`);
    
    if (currentAllowance.lt(amount)) {
        console.log(`   Approving ${ethers.utils.formatUnits(ethers.constants.MaxUint256, decimals)} ${symbol}...`);
        
        try {
            const approveTx = await collateral.approve(CONFIG.CTF_ADDRESS, ethers.constants.MaxUint256, {
                gasLimit: 100000
            });
            console.log("   Transaction sent:", approveTx.hash);
            console.log("   Waiting for confirmation...");
            
            await approveTx.wait();
            console.log("✓ Approval confirmed!");
        } catch (error) {
            console.error("\n❌ Error approving collateral:", error.message);
            if (error.reason) {
                console.error("   Reason:", error.reason);
            }
            process.exit(1);
        }
    } else {
        console.log("✓ Already approved");
    }

    // Step 2: Split position
    console.log("\n🎲 Step 2: Splitting position...");
    console.log(`   Splitting ${ethers.utils.formatUnits(amount, decimals)} ${symbol} into ${CONFIG.PARTITION.length} positions...`);
    
    console.log("   Parameters:");
    console.log("   - Collateral:", CONFIG.COLLATERAL_ADDRESS);
    console.log("   - Parent Collection ID:", CONFIG.PARENT_COLLECTION_ID);
    console.log("   - Condition ID:", conditionId);
    console.log("   - Partition:", CONFIG.PARTITION);
    console.log("   - Amount:", ethers.utils.formatUnits(amount, decimals), symbol);

    let receipt;
    
    try {
        const splitTx = await ctf.splitPosition(
            CONFIG.COLLATERAL_ADDRESS,
            CONFIG.PARENT_COLLECTION_ID,
            conditionId,
            CONFIG.PARTITION,
            amount,
            {
                gasLimit: CONFIG.GAS_LIMIT
            }
        );
        
        console.log("\n   Transaction sent:", splitTx.hash);
        console.log("   Waiting for confirmation...");
        
        receipt = await splitTx.wait();
        
        console.log("\n✅ Position split successfully!");
        console.log("   Transaction hash:", receipt.transactionHash);
        console.log("   Block number:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
    } catch (error) {
        console.error("\n❌ Error splitting position:");
        console.error("   Message:", error.message);
        
        if (error.reason) {
            console.error("   Reason:", error.reason);
        }
        
        if (error.data) {
            console.error("   Data:", error.data);
        }
        
        if (error.message.includes('insufficient allowance')) {
            console.error("\n💡 Tip: Approval might have failed. Try running the script again.");
        }
        
        if (error.message.includes('partition not disjoint')) {
            console.error("\n💡 Tip: Check that partition index sets don't overlap.");
            console.error("   Example for 2 outcomes: [1, 2] is valid, [3, 2] is invalid (overlap)");
        }
        
        process.exit(1);
    }

    // Step 3: Verify new balances
    console.log("\n📊 Verifying new token balances...");
    
    const balancesAfter = {};
    for (let i = 0; i < CONFIG.PARTITION.length; i++) {
        const balance = await ctf.balanceOf(wallet.address, positionIds[i]);
        balancesAfter[CONFIG.PARTITION[i]] = balance;
        console.log(`   Position ${CONFIG.PARTITION[i]}: ${ethers.utils.formatUnits(balance, decimals)}`);
    }
    
    const collateralBalanceAfter = await collateral.balanceOf(wallet.address);
    
    console.log("\n   Changes:");
    for (let i = 0; i < CONFIG.PARTITION.length; i++) {
        const indexSet = CONFIG.PARTITION[i];
        const before = balancesBefore[indexSet] || ethers.BigNumber.from(0);
        const after = balancesAfter[indexSet];
        const diff = after.sub(before);
        console.log(`   Position ${indexSet}: +${ethers.utils.formatUnits(diff, decimals)}`);
    }
    
    const collateralDiff = collateralBalance.sub(collateralBalanceAfter);
    console.log(`   ${symbol}: -${ethers.utils.formatUnits(collateralDiff, decimals)}`);

    // Summary
    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║            ✅ SPLIT POSITION COMPLETE!                 ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    
    console.log("\n📝 Summary:");
    console.log(`   Split ${ethers.utils.formatUnits(amount, decimals)} ${symbol}`);
    console.log(`   Created ${CONFIG.PARTITION.length} positions`);
    console.log(`   Condition ID: ${conditionId}`);
    
    console.log("\n🎯 Next steps:");
    console.log("   • Trade positions with other users");
    console.log("   • Wait for condition resolution");
    console.log("   • Redeem winning positions after resolution");
    
    if (receipt && receipt.transactionHash) {
        console.log("\n💡 View transaction on block explorer:");
        console.log(`   Transaction: ${receipt.transactionHash}`);
    }
    
    console.log();
}

// Run
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("\n❌ Unhandled error:", error);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    });

