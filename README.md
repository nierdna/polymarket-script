# Split Position Script

Script để split position với `conditionId` trên Conditional Tokens.

## Cài đặt

```bash
npm install
```

## Lấy Condition ID

Lấy `conditionId` từ Polymarket API:

```bash
# Lấy market detail từ slug
curl https://gamma-api.polymarket.com/markets/slug/bitcoin-above-on-december-2

# Extract conditionId từ response (dùng jq)
curl -s https://gamma-api.polymarket.com/markets/slug/bitcoin-above-on-december-2 | jq -r '.conditionId'
```

**Lưu ý**: Thay `bitcoin-above-on-december-2` bằng slug của market bạn muốn.

## Cấu hình

Tạo file `.env`:

```bash
RPC_URL=https://polygon-rpc.com
PRIVATE_KEY=your_private_key
CTF_ADDRESS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
COLLATERAL_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
CONDITION_ID=0x8503d6b6fcd8f92aaf81fdafbb74d92ce591aac4a387207001258045d3fc4b9f
AMOUNT=100
```

## Sử dụng

```bash
node splitPosition.js
```

## Parameters

- `CONDITION_ID`: Condition ID (bắt buộc)
- `COLLATERAL_ADDRESS`: Collateral token address (bắt buộc)
- `AMOUNT`: Amount to split (mặc định: 100)
- `PARTITION`: Optional, auto-generated nếu không set

## Troubleshooting

- **Gas price error**: Script tự động set EIP-1559 (min 25 Gwei)
- **Insufficient balance**: Check collateral balance
- **Condition not found**: Verify `CONDITION_ID`
