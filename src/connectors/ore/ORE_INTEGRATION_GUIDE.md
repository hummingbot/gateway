# ORE Program Integration Guide

Reference documentation for the Hummingbot Gateway connector for the ORE mining game on Solana.

Instruction and account layouts below were taken from the ORE `api` crate
(regolith-labs/ore: `api/src/instruction.rs`, `api/src/sdk.rs`, `api/src/state/*.rs`) and
**verified against live mainnet transactions** of the deployed program. This connector covers
the **mining** game only. Staking lives in a separate program (regolith-labs/ore-stake) and is
out of scope here.

## Program Overview

ORE is a proof-of-work style mining game where participants deploy SOL to a 5x5 grid (25
squares). Each round, a winning square is determined by on-chain entropy; participants who
deployed to that square earn ORE tokens (either split pro-rata or awarded to a single
"top miner" by weighted lottery, depending on the round's distribution mask).

### v4 payout model (live since 2026-08-12)

The v4 program update **removed parimutuel SOL payouts**: SOL no longer moves from losing
miners to winning miners. Instead, each miner's deployed SOL is returned minus fees
(`program/src/checkpoint.rs`):

- **Winning square**: deployment returned minus a 1% admin fee (~99% back), plus ORE rewards.
- **Losing squares**: deployment returned minus the 1% admin fee and a 10% protocol fee on
  the remainder (~89% back), no ORE.
- If a round has no entropy (no RNG), all deployed SOL is refunded in full.

ORE rewards remain variable (per-square rewards, top-miner lottery, motherlode), but the SOL
cost of mining is now deterministic. The on-chain `Round.total_winnings` field was renamed to
`total_returned_sol` (same offset/size) to reflect this.

**Key URLs:**
- App: https://ore.supply/
- Repository: https://github.com/regolith-labs/ore
- Rust API crate: `api/` (consts, instruction, sdk, state)

## Program IDs & Constants

```
ORE Program:      oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv
ORE Token Mint:   oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp   (11 decimals)
Entropy Program:  3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X
Entropy Var:      BWCaDY96Xe4WkFq1M7UiCCRcChsJ3p51L5KrGzhxgm2E   (entropy var_pda(board, 0))
```

The singleton PDAs resolve to fixed addresses (from `api/src/consts.rs`):

```
Board:    BrcSxdp1nXFzou1YyDnQJcPNBNHgoypZmTsyKBSLLXzi   (["board"])
Config:   9c9X7aDRAF41faiDs94ELjT19UrGnn72wBW9hPsS4Awy   (["config"])
Treasury: 45db2FSR4mcXdSVVZbKbwojU6uYDpMyhpEi7cC8nHaWG   (["treasury"])
```

## Framework Notes

ORE is built with **Steel** (https://github.com/regolith-labs/steel), NOT Anchor:

1. **Instruction discriminators** are single `u8` values (not 8-byte Anchor discriminators).
2. **Account discriminators** are 8 bytes with a simple numeric pattern, e.g. `[105, 0, 0, 0, 0, 0, 0, 0]`.
3. Account structs are `#[repr(C)]` Pod types — parse them by fixed byte offsets.

### Instruction Discriminators (`OreInstruction`)

```
automate  = 0     reset     = 9      setAdmin = 15
checkpoint = 2    buyback   = 13     newVar   = 19
claimSol  = 3     wrap      = 14     bury     = 24
claimOre  = 4                        liq      = 25
close     = 5
deploy    = 6
log       = 8
```

> Note: staking instructions (deposit/withdraw/claimYield) do **not** exist in this program.
> Earlier drafts of this connector assumed discriminators 10–12 for staking; those are wrong.

### Account Discriminators (first 8 bytes, `OreAccount`)

```
Automation = [100, ...]   Treasury = [104, ...]
Config     = [101, ...]   Board    = [105, ...]
Miner      = [103, ...]   Round    = [109, ...]
```

## PDA Seeds

| Account | Seeds | Notes |
|---------|-------|-------|
| Automation | `["automation", authority]` | Per-user automation config |
| Board | `["board"]` | Singleton, tracks current round |
| Config | `["config"]` | Singleton, program settings |
| Miner | `["miner", authority]` | Per-user mining state |
| Round | `["round", round_id (u64 LE)]` | Per-round state |
| Treasury | `["treasury"]` | Singleton, token vault |

## Core Mining Flow

### 1. Deploy SOL to Squares — `deploy` (disc 6)

**Args:** `amount: u64` (lamports), `squares: u32` (bitmask over squares 0–24). Data = `[6][amount u64 LE][squares u32 LE]` (13 bytes).

**Accounts (12):**
```
 0 signer          [signer, writable]
 1 authority       [writable]    # usually == signer
 2 automation      [writable]    # PDA ["automation", authority]
 3 board           [writable]    # PDA ["board"]
 4 config          [writable]    # PDA ["config"]
 5 miner           [writable]    # PDA ["miner", authority]
 6 round           [writable]    # PDA ["round", board.round_id]
 7 treasury        [writable]    # PDA ["treasury"]
 8 systemProgram   []
 9 oreProgram      []
10 entropyVar      [writable]    # BWCaDY96Xe4WkFq1M7UiCCRcChsJ3p51L5KrGzhxgm2E
11 entropyProgram  []            # 3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X
```

**Square bitmask examples:** square 0 → `1`; center square (index 12) → `4096`; all 25 → `33554431`.

### 2. Settle Rewards After Round Ends — `checkpoint` (disc 2)

**Args:** none. Data = `[2]`.

**Accounts (8):**
```
0 signer        [signer, writable]
1 authority      [writable]   # == signer
2 automation     [writable]   # PDA ["automation", authority]
3 board          [writable]   # PDA ["board"]
4 miner          [writable]   # PDA ["miner", authority]
5 round          [writable]   # PDA ["round", completed_round_id]
6 treasury       [writable]   # PDA ["treasury"]
7 systemProgram  []
```

### 3. Claim SOL Rewards — `claimSol` (disc 3)

**Args:** none. Data = `[3]`.

**Accounts (5):**
```
0 signer        [signer, writable]
1 board         [writable]   # PDA ["board"]
2 miner         [writable]   # PDA ["miner", signer]
3 systemProgram []
4 oreProgram    []
```

Withdraws `miner.rewards_sol` to the signer.

### 4. Claim ORE Rewards — `claimOre` (disc 4)

**Args:** `bps: u64` — portion to claim in basis points (10000 = 100%, clamped on-chain). Data = `[4][bps u64 LE]` (9 bytes).

**Accounts (11):**
```
 0 signer                 [signer, writable]
 1 board                  [writable]   # PDA ["board"]
 2 miner                  [writable]   # PDA ["miner", signer]
 3 mint                   [writable]   # oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp
 4 recipient              [writable]   # signer's ORE ATA
 5 treasury               [writable]   # PDA ["treasury"]
 6 treasuryTokens         [writable]   # treasury's ORE ATA
 7 systemProgram          []
 8 tokenProgram           []           # TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
 9 associatedTokenProgram []           # ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
10 oreProgram             []
```

Withdraws the requested portion of the miner's ORE rewards to the recipient ATA.

## Key Account Structures

All fields are little-endian; layouts follow the `#[repr(C)]` Rust structs exactly. `Numeric`
is a 16-byte fixed-point value. Offsets below are relative to the account data start (the 8-byte
discriminator precedes the struct).

### Board (singleton) — 40 bytes total
```
@8  round_id: u64
@16 start_slot: u64
@24 end_slot: u64
@32 production_cost_ema: u64
```

### Miner (per user) — 752 bytes total
```
@8   authority: Pubkey
@40  auto_return: u64
@48  checkpoint_id: u64
@56  checkpoint_fee: u64
@64  deployed: [u64; 25]      # SOL deployed per square this round
@264 mass: [u64; 25]          # time-weighted SOL per square
@464 cumulative: [u64; 25]    # cumulative mass per square before this miner
@664 round_id: u64            # last active round
@672 rewards_factor: Numeric  # 16 bytes
@688 rewards_sol: u64         # claimable SOL
@696 refined_ore: u64
@704 rewards_ore: u64         # claimable ORE
@712 last_claim_ore_at: i64
@720 last_claim_sol_at: i64
@728 lifetime_rewards_ore: u64
@736 lifetime_deployed: u64
@744 lifetime_rewards_sol: u64
```

### Round (per round) — 952 bytes total
```
@8   id: u64
@16  deployed: [u64; 25]      # total SOL per square
@216 mass: [u64; 25]
@416 count: [u64; 25]         # unique miners per square
@616 slot_hash: [u8; 32]      # entropy (zero until finalized)
@648 expires_at: u64
@656 motherlode: u64
@664 rent_payer: Pubkey
@696 rewards: [u64; 25]       # ORE reward per square
@896 total_vaulted: u64       # SOL collected by the protocol
@904 total_returned_sol: u64  # SOL returned to miners (pre-v4: total_winnings)
@912 total_miners: u64
@920 top_miner: Pubkey        # winner, SPLIT_ADDRESS if split, system if none
```

`total_deployed` and `top_miner_reward` are not stored; compute them as `sum(deployed)` and
`sum(rewards)` respectively.

### Treasury (singleton) — 48 bytes total
```
@8  motherlode: u64
@16 miner_rewards_factor: Numeric  # 16 bytes
@32 total_refined: u64
@40 total_unclaimed: u64
```

## Winning Square (RNG)

For a finalized round, XOR the four 8-byte little-endian chunks of `slot_hash`, then take
`rng % 25` for the 0-indexed winning square (the connector reports it 1-indexed).

## Typical Integration Workflow

```
1. Fetch Board account          → current round_id, end_slot
2. Fetch Round account          → prize pool, per-square deployments, time remaining
3. deploy SOL to chosen squares
4. Wait for the round to end (board.end_slot passes)
5. checkpoint to settle rewards for that round
6. claimSol and/or claimOre to withdraw
```

## Serialization Notes

1. All integers are little-endian.
2. PublicKeys are 32 bytes.
3. Instruction data: `[discriminator (1 byte)] [args...]`.
4. Account data: `[discriminator (8 bytes)] [fields...]`.
5. Arrays like `[u64; 25]` are 25 consecutive u64 LE values (200 bytes).
