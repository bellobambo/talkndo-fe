# TalknDo

TalknDo is a Solana-based accountability platform that helps people turn personal goals into challenges they commit to completing. Users put something meaningful at stake by locking SOL in an on-chain escrow account until they finish their challenge.

I built TalknDo after realizing that even though I love working out, I can still find reasons to skip it. Passion alone does not always lead to action; accountability and real consequences can provide the extra push needed when motivation fades. Although the idea began with fitness, TalknDo can be used for studying, learning a skill, completing a side project, pursuing a creative goal, or achieving anything else that matters.

## How It Works

1. Connect a Phantom or Solflare wallet on Solana devnet.
2. Create a challenge with a title, supporting details or file, stake amount, and deadline.
3. Sign the transaction to lock the selected SOL in a challenge PDA that acts as an on-chain escrow account.
4. Complete the challenge before its deadline and upload a PDF or image as proof.
5. Review and sign the completion transaction to reclaim the staked SOL and receive a non-transferable Metaplex Core NFT achievement badge.
6. If the deadline is missed, expire the challenge and move its stake to the charity escrow account.

Authorized treasury members can withdraw funds from the charity escrow for charitable causes. The program restricts treasury access and preserves the account's minimum rent reserve.

## Features

- Wallet connection through Phantom and Solflare
- SOL staking through PDA-based challenge escrow accounts
- Active, completed, and expired challenge tracking
- Challenge details and proof uploads stored on IPFS through Pinata
- Stake reclamation after successful completion
- Non-transferable achievement badges minted with Metaplex Core
- Overdue challenge expiry and charity fund collection
- Restricted treasury membership and charity withdrawal controls
- Transaction simulation before wallet confirmation
- Solana Explorer links for challenge accounts and the deployed program

## Solana Program

TalknDo currently runs on **Solana devnet**.

- **Program ID:** [`9CLYHqqCBfDsuDrwooBbzV8FuvVzsZwadUCZ2NLWSURE`](https://explorer.solana.com/address/9CLYHqqCBfDsuDrwooBbzV8FuvVzsZwadUCZ2NLWSURE?cluster=devnet)
- **Smart contract repository:** [github.com/bellobambo/talk-do](https://github.com/bellobambo/talk-do)

The frontend uses the checked-in Anchor IDL to construct and submit program instructions for creating, completing, and expiring challenges, as well as managing treasury access and charity withdrawals.

## Tech Stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS and Ant Design
- Solana Wallet Adapter
- Anchor TypeScript client and Solana Web3.js
- Pinata and IPFS
- Metaplex Core

## Run Locally

### Prerequisites

- Node.js and npm
- A Phantom or Solflare wallet configured for Solana devnet
- Devnet SOL for transaction fees and challenge stakes
- A Pinata account for file uploads

### Setup

Clone the repository and install its dependencies:

```bash
git clone https://github.com/bellobambo/talkndo-fe.git
cd talkndo-fe
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

Configure the following values in `.env.local`:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_TALKN_DO_PROGRAM_ID=9CLYHqqCBfDsuDrwooBbzV8FuvVzsZwadUCZ2NLWSURE
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY_URL=https://your-gateway.mypinata.cloud
```

`PINATA_JWT` is server-only and must never be exposed with a `NEXT_PUBLIC_` prefix.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
npm run dev    # Start the development server
npm run build  # Create a production build
npm run start  # Start the production server
npm run lint   # Run ESLint
```

## Links

- **Live application:** [talkndo-fe.vercel.app](https://talkndo-fe.vercel.app)
- **Frontend repository:** [github.com/bellobambo/talkndo-fe](https://github.com/bellobambo/talkndo-fe)
- **Smart contract repository:** [github.com/bellobambo/talk-do](https://github.com/bellobambo/talk-do)

## Network Notice

TalknDo is currently a devnet project. Devnet SOL has no real-world monetary value, and the application should not be used with real funds.
