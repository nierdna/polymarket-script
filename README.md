# Polymarket Script - Conditional Tokens

Scripts để tương tác với Conditional Tokens contracts, đặc biệt là hàm `splitPosition`.

## 📋 Mục lục

1. [Cài đặt](#cài-đặt)
2. [Cấu hình](#cấu-hình)
3. [Sử dụng](#sử-dụng)
4. [Giải thích Parameters](#giải-thích-parameters)
5. [Troubleshooting](#troubleshooting)
6. [Ví dụ](#ví-dụ)

---

## 🚀 Cài đặt

### 1. Cài đặt dependencies

```bash
cd polymarket-script
npm install
```

Hoặc nếu dùng yarn:

```bash
yarn install
```

### 2. Kiểm tra cấu trúc thư mục

Sau khi cài đặt, thư mục của bạn nên có cấu trúc:

```
polymarket-script/
├── abis/
│   └── ConditionalTokens.json
├── utils/
│   └── id-helpers.js
├── splitPosition.js
├── package.json
└── README.md
```

---

## ⚙️ Cấu hình

### Cách 1: Environment Variables (Khuyến nghị)

Tạo file `.env` trong thư mục `polymarket-script`:

```bash
# Network & Wallet
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_private_key_here

# Contract Addresses
CTF_ADDRESS=0x0BDF5813b86C54F1e89D22529DAc53BAb3FD6040
COLLATERAL_ADDRESS=0xAf49D6BdEBFE7351C30C3766551a2E3B3a523cB0

# Condition Parameters
ORACLE=0xYourOracleAddress
QUESTION_ID=0x544553545f4d41524b45545f31...
OUTCOME_SLOT_COUNT=2

# Split Parameters
PARTITION=[1,2]
AMOUNT=100
PARENT_COLLECTION_ID=0x0000000000000000000000000000000000000000000000000000000000000000

# Gas
GAS_LIMIT=300000
```

### Cách 2: Chỉnh sửa trong file script

Mở file `splitPosition.js` và chỉnh sửa object `CONFIG`:

```javascript
const CONFIG = {
    RPC_URL: 'https://sepolia.base.org',
    PRIVATE_KEY: 'your_private_key',
    CTF_ADDRESS: '0x0BDF5813b86C54F1e89D22529DAc53BAb3FD6040',
    // ... các config khác
};
```

---

## 📖 Sử dụng

### Chạy script splitPosition

```bash
node splitPosition.js
```

Hoặc dùng npm script:

```bash
npm run split
```

### Flow thực thi

Script sẽ tự động thực hiện các bước sau:

1. ✅ Kết nối đến network (RPC URL)
2. ✅ Validate wallet và balance ETH
3. ✅ Kết nối đến ConditionalTokens và Collateral contracts
4. ✅ Tính toán Condition ID
5. ✅ Prepare condition nếu chưa có
6. ✅ Kiểm tra collateral balance
7. ✅ Validate partition
8. ✅ Approve collateral token (nếu cần)
9. ✅ Gọi `splitPosition()`
10. ✅ Verify kết quả và hiển thị balances

---

## 🔍 Giải thích Parameters

### Network & Wallet

- **RPC_URL**: URL của blockchain network (vd: `https://sepolia.base.org`, `https://mainnet.infura.io/v3/YOUR_KEY`)
- **PRIVATE_KEY**: Private key của wallet (không cần prefix `0x`)

### Contract Addresses

- **CTF_ADDRESS**: Địa chỉ của ConditionalTokens contract
- **COLLATERAL_ADDRESS**: Địa chỉ của ERC20 token làm collateral (vd: USDC)

### Condition Parameters

- **ORACLE**: Địa chỉ của oracle sẽ report kết quả. Nếu không set, script sẽ dùng wallet address
- **QUESTION_ID**: 32 bytes identifier cho câu hỏi. Có thể dùng `ethers.utils.formatBytes32String('text')` để convert
- **OUTCOME_SLOT_COUNT**: Số lượng outcomes (2-256). Ví dụ: `2` cho binary market (YES/NO)

### Split Parameters

- **PARTITION**: Mảng các index sets để split. Ví dụ:
  - Binary market (YES/NO): `[1, 2]` tương đương `[0b01, 0b10]`
  - 3 outcomes (A/B/C): `[1, 2, 4]` tương đương `[0b001, 0b010, 0b100]`
  - **Lưu ý**: Các index sets phải disjoint (không trùng lặp)

- **AMOUNT**: Số lượng token cần split (theo đơn vị token, không phải wei). Script sẽ tự động convert với decimals

- **PARENT_COLLECTION_ID**: 
  - `bytes32(0)` nếu split trực tiếp từ collateral
  - Collection ID cụ thể nếu split từ position sẵn có

### Gas

- **GAS_LIMIT**: Gas limit cho transaction (mặc định: 300000)

---

## 🛠️ Troubleshooting

### Lỗi: "PRIVATE_KEY not found"

**Giải pháp**: 
- Đảm bảo đã set `PRIVATE_KEY` trong `.env` hoặc `CONFIG`
- Hoặc export environment variable: `export PRIVATE_KEY=your_key`

### Lỗi: "No ETH balance for gas"

**Giải pháp**: 
- Cần có ETH trong wallet để trả gas
- Lấy testnet ETH từ faucet (vd: Base Sepolia faucet)

### Lỗi: "Insufficient collateral balance"

**Giải pháp**: 
- Kiểm tra balance của collateral token
- Giảm `AMOUNT` hoặc deposit thêm collateral

### Lỗi: "Partition not disjoint"

**Giải pháp**: 
- Đảm bảo các index sets trong partition không overlap
- Ví dụ hợp lệ: `[1, 2]` (YES và NO riêng biệt)
- Ví dụ không hợp lệ: `[3, 2]` (overlap ở bit 2)

### Lỗi: "condition already prepared"

**Giải pháp**: 
- Đây là warning bình thường, script sẽ tiếp tục
- Condition đã tồn tại thì không cần prepare lại

### Lỗi: "Approval might have failed"

**Giải pháp**: 
- Thử chạy lại script
- Kiểm tra transaction trên block explorer
- Đảm bảo có đủ ETH cho gas

---

## 💡 Ví dụ

### Ví dụ 1: Binary Market (YES/NO)

```javascript
const CONFIG = {
    RPC_URL: 'https://sepolia.base.org',
    PRIVATE_KEY: '0x...',
    CTF_ADDRESS: '0x0BDF5813b86C54F1e89D22529DAc53BAb3FD6040',
    COLLATERAL_ADDRESS: '0xAf49D6BdEBFE7351C30C3766551a2E3B3a523cB0',
    ORACLE: '0xYourAddress',
    QUESTION_ID: ethers.utils.formatBytes32String('Will ETH > $5000?'),
    OUTCOME_SLOT_COUNT: 2,
    PARTITION: [1, 2], // YES, NO
    AMOUNT: '1000', // 1000 USDC
};
```

**Kết quả**: 
- Split 1000 USDC thành:
  - 1000 YES tokens (position 1)
  - 1000 NO tokens (position 2)

### Ví dụ 2: 3 Outcomes (A/B/C)

```javascript
const CONFIG = {
    // ... các config khác
    OUTCOME_SLOT_COUNT: 3,
    PARTITION: [1, 2, 4], // [0b001, 0b010, 0b100]
    AMOUNT: '500',
};
```

**Kết quả**: 
- Split 500 tokens thành:
  - 500 Position A tokens
  - 500 Position B tokens
  - 500 Position C tokens

### Ví dụ 3: Split từ Position sẵn có

```javascript
const CONFIG = {
    // ... các config khác
    PARENT_COLLECTION_ID: '0x...', // Collection ID của position hiện có
    PARTITION: [1, 2],
    AMOUNT: '100',
};
```

**Kết quả**: 
- Split position sẵn có thành 2 positions sâu hơn

---

## 📚 Tài liệu tham khảo

### Conditional Tokens Framework

- **Documentation**: [Gnosis Conditional Tokens Docs](https://docs.gnosis.io/conditionaltokens/)
- **GitHub**: [gnosis/conditional-tokens-contracts](https://github.com/gnosis/conditional-tokens-contracts)

### Khái niệm

- **Condition**: Một câu hỏi cần được oracle trả lời
- **Outcome Slot**: Một trong các kết quả có thể của condition
- **Position**: Token đại diện cho quyền nhận payout nếu condition xảy ra
- **Split**: Chia một position thành nhiều positions
- **Merge**: Gộp nhiều positions thành một position
- **Partition**: Tập các index sets disjoint

### Index Set Representation

Index sets được biểu diễn bằng bit array:

- `1` (0b01) = Outcome slot 0
- `2` (0b10) = Outcome slot 1
- `3` (0b11) = Outcome slot 0 và 1 (cả hai)
- `4` (0b100) = Outcome slot 2
- `5` (0b101) = Outcome slot 0 và 2

**Lưu ý**: Partition phải disjoint, không được overlap.

---

## 🔐 Bảo mật

### Private Key

- **KHÔNG** commit private key vào git
- Sử dụng `.env` và thêm vào `.gitignore`
- Hoặc dùng environment variables

### Transaction

- Luôn verify transaction trên block explorer trước khi confirm
- Check gas limit phù hợp để tránh failed transactions
- Start với amount nhỏ để test

---

## 📝 Checklist trước khi chạy

- [ ] Đã cài đặt dependencies (`npm install`)
- [ ] Đã cấu hình RPC_URL
- [ ] Đã set PRIVATE_KEY
- [ ] Đã set CTF_ADDRESS và COLLATERAL_ADDRESS
- [ ] Wallet có đủ ETH để trả gas
- [ ] Wallet có đủ collateral tokens
- [ ] Partition đã được validate (disjoint)
- [ ] Condition parameters đã đúng

---

## 🆘 Hỗ trợ

Nếu gặp vấn đề:

1. Kiểm tra lại các parameters trong CONFIG
2. Xem transaction trên block explorer
3. Check console logs để xem bước nào fail
4. Tham khảo Troubleshooting section ở trên

---

## 📄 License

MIT

---

**Created**: 2024  
**Version**: 1.0.0

