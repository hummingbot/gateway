# Repository Setup Guide

This guide walks through setting up the `nfttools/protocol-sdk` private repository and preparing for development.

---

## Prerequisites

- GitHub account with access to `nfttools` organization
- Git installed locally
- Node.js 20+ installed
- pnpm installed globally
- SSH key configured with GitHub

---

## Step 1: Create GitHub Repository

### Option A: Via GitHub CLI (Recommended)

```bash
# Install GitHub CLI if not already installed
# macOS
brew install gh

# Login to GitHub
gh auth login

# Create private repository in nfttools organization
gh repo create nfttools/protocol-sdk \
  --private \
  --description "Protocol-agnostic DeFi SDK supporting multiple chains and protocol types" \
  --clone

# This will create and clone the repo locally
cd protocol-sdk
```

### Option B: Via GitHub Web Interface

1. Go to https://github.com/organizations/nfttools/repositories/new
2. Fill in details:
   - **Repository name**: `protocol-sdk`
   - **Description**: "Protocol-agnostic DeFi SDK supporting multiple chains and protocol types"
   - **Visibility**: Private
   - **Initialize**: Do not initialize with README (we'll import from Gateway)
3. Click "Create repository"
4. Clone locally:
   ```bash
   git clone git@github.com:nfttools/protocol-sdk.git
   cd protocol-sdk
   ```

---

## Step 2: Import Gateway Code

The current directory already has the Gateway code. We need to:
1. Initialize git repository (if not already)
2. Add remotes
3. Copy documentation

```bash
# Navigate to the current gateway directory
cd /Users/admin/Library/CloudStorage/Dropbox/NFTtoolz/Cendars/Development/Turbo/LP_SDK/hummingbot/gateway

# Check current git status
git status

# Add the new protocol-sdk repo as a remote
git remote add protocol-sdk git@github.com:nfttools/protocol-sdk.git

# Or if you cloned protocol-sdk separately:
# Copy all Gateway files to protocol-sdk directory
# rsync -av --exclude='.git' /path/to/gateway/ /path/to/protocol-sdk/

# Copy documentation files
cp LP_SDK_PLAN.md /path/to/protocol-sdk/
cp REPOSITORY_SETUP.md /path/to/protocol-sdk/
# (Other docs will be created later)

# Push to new repo
git push protocol-sdk main
```

---

## Step 3: Repository Configuration

### 3.1 Branch Protection Rules

Configure branch protection for `main` branch:

**Via GitHub CLI:**
```bash
gh api repos/nfttools/protocol-sdk/branches/main/protection \
  -X PUT \
  -F required_status_checks[strict]=true \
  -F required_status_checks[contexts][]=ci \
  -F required_pull_request_reviews[required_approving_review_count]=1 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -F enforce_admins=true \
  -F restrictions=null
```

**Via Web Interface:**
1. Go to Settings → Branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require pull request reviews before merging (1 approval)
   - ✅ Dismiss stale pull request approvals
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date
   - ✅ Include administrators
5. Save changes

### 3.2 GitHub Labels

Create labels for issue/PR management:

```bash
# Create labels via GitHub CLI
gh label create "type: feature" --color "0366d6" --description "New feature"
gh label create "type: bugfix" --color "d73a4a" --description "Bug fix"
gh label create "type: refactor" --color "fbca04" --description "Code refactoring"
gh label create "type: docs" --color "0075ca" --description "Documentation"
gh label create "type: test" --color "1d76db" --description "Testing"

gh label create "priority: high" --color "d93f0b" --description "High priority"
gh label create "priority: medium" --color "fbca04" --description "Medium priority"
gh label create "priority: low" --color "0e8a16" --description "Low priority"

gh label create "phase: 0" --color "f9d0c4" --description "Phase 0: Setup"
gh label create "phase: 1" --color "c5def5" --description "Phase 1: SDK Extraction"
gh label create "phase: 2" --color "bfdadc" --description "Phase 2: Pool Creation"
gh label create "phase: 3" --color "d4c5f9" --description "Phase 3: Missing Connectors"
gh label create "phase: 4" --color "c2e0c6" --description "Phase 4: Multi-Protocol"
gh label create "phase: 5" --color "fef2c0" --description "Phase 5: Optimization"
gh label create "phase: 6" --color "bfd4f2" --description "Phase 6: Documentation"

gh label create "status: in-progress" --color "fbca04" --description "Work in progress"
gh label create "status: review" --color "0e8a16" --description "Ready for review"
gh label create "status: blocked" --color "d73a4a" --description "Blocked"
```

### 3.3 Repository Secrets

Add secrets for development and testing:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `DEVNET_RPC` - Solana devnet RPC URL
   - `MAINNET_RPC` - Solana mainnet RPC URL (if needed)
   - `ETHEREUM_RPC` - Ethereum RPC URL
   - `INFURA_API_KEY` - Infura API key
   - `HELIUS_API_KEY` - Helius API key

**Via CLI:**
```bash
gh secret set DEVNET_RPC --body "https://api.devnet.solana.com"
gh secret set INFURA_API_KEY --body "your_infura_key"
gh secret set HELIUS_API_KEY --body "your_helius_key"
```

---

## Step 4: Development Environment Setup

### 4.1 Install Dependencies

```bash
cd /path/to/protocol-sdk

# Install all dependencies
pnpm install

# Build the project
pnpm build

# Run tests to verify everything works
pnpm test
```

### 4.2 Setup Git Hooks

The project already has Husky configured. Ensure hooks are installed:

```bash
pnpm prepare
```

This will setup:
- Pre-commit hook: Runs linting and formatting
- Pre-push hook: Runs tests

### 4.3 IDE Setup (VS Code)

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## Step 5: Verify Setup

Run through this checklist to verify everything is setup correctly:

### Repository
- [ ] Private repository `nfttools/protocol-sdk` created
- [ ] Gateway code imported
- [ ] Branch protection rules configured
- [ ] Labels created
- [ ] Secrets added

### Development
- [ ] Dependencies installed successfully
- [ ] Build completes without errors
- [ ] Tests pass locally
- [ ] Git hooks working

### Verification Commands

```bash
# Test build
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Check types
pnpm typecheck

# Verify git hooks
git commit --allow-empty -m "Test commit" # Should trigger pre-commit hook

# Push to test branch
git checkout -b test-setup
git push -u origin test-setup
```

---

## Step 6: Team Access

### 6.1 Add Team Members

**Via GitHub CLI:**
```bash
# Add team member with write access
gh api orgs/nfttools/teams/protocol-sdk/memberships/USERNAME \
  -X PUT \
  -F role=member

# Or add with admin access
gh api repos/nfttools/protocol-sdk/collaborators/USERNAME \
  -X PUT \
  -F permission=admin
```

**Via Web Interface:**
1. Go to Settings → Manage access
2. Click "Add people"
3. Search for team member
4. Select permission level (Write or Admin)

### 6.2 Setup Notifications

Configure notification settings:
1. Go to Watching → Custom
2. Enable:
   - ✅ Issues
   - ✅ Pull requests
   - ✅ Releases
   - ✅ Discussions

---

## Next Steps

Once repository setup is complete:

1. **Review Documentation**
   - Read `LP_SDK_PLAN.md` thoroughly
   - Review architecture decisions
   - Understand the 6-phase plan

2. **Start Phase 1**
   - Create branch: `feature/sdk-core-structure`
   - Begin work on PR #1
   - Follow the detailed plan in `LP_SDK_PLAN.md`

3. **Weekly Sync**
   - Review progress vs timeline
   - Adjust plan if needed
   - Celebrate wins!

---

## Troubleshooting

### Issue: pnpm install fails

```bash
# Clear cache and retry
rm -rf node_modules pnpm-lock.yaml
pnpm install --force
```

### Issue: Tests fail

```bash
# Run tests in verbose mode
GATEWAY_TEST_MODE=dev pnpm test --verbose

# Clear Jest cache
pnpm test:clear-cache
```

### Issue: Build fails

```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Issue: Git hooks not working

```bash
# Reinstall hooks
rm -rf .husky/_
pnpm prepare
```

---

## Support

**Issues**: Open an issue on GitHub
**Questions**: Comment on relevant issue or PR
**Urgent**: Contact project lead directly

---

**Setup Date**: 2025-01-23
**Last Updated**: 2025-01-23
**Version**: 1.0
