#!/bin/bash

# Protocol SDK - GitHub Repository Setup Script
# This script automates the creation and configuration of the GitHub repository

set -e  # Exit on error

echo "🚀 Protocol SDK - GitHub Repository Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is not installed${NC}"
    echo ""
    echo "Install it with:"
    echo "  macOS: brew install gh"
    echo "  Linux: See https://github.com/cli/cli#installation"
    echo ""
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not authenticated with GitHub${NC}"
    echo "Running authentication flow..."
    gh auth login
fi

echo -e "${GREEN}✓ GitHub CLI authenticated${NC}"
echo ""

# Repository details
ORG="nfttools"
REPO="protocol-sdk"
FULL_REPO="$ORG/$REPO"
DESCRIPTION="Protocol-agnostic DeFi SDK supporting multiple chains and protocol types"

# Step 1: Create repository
echo "📦 Step 1: Creating repository $FULL_REPO..."
if gh repo view $FULL_REPO &> /dev/null; then
    echo -e "${YELLOW}⚠️  Repository already exists${NC}"
    read -p "Do you want to continue with existing repo? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    gh repo create $FULL_REPO \
        --private \
        --description "$DESCRIPTION" \
        --clone=false

    echo -e "${GREEN}✓ Repository created${NC}"
fi
echo ""

# Step 2: Add remote
echo "🔗 Step 2: Adding remote..."
if git remote | grep -q "protocol-sdk"; then
    echo -e "${YELLOW}⚠️  Remote 'protocol-sdk' already exists${NC}"
    git remote set-url protocol-sdk "git@github.com:$FULL_REPO.git"
    echo -e "${GREEN}✓ Remote updated${NC}"
else
    git remote add protocol-sdk "git@github.com:$FULL_REPO.git"
    echo -e "${GREEN}✓ Remote added${NC}"
fi
echo ""

# Step 3: Push code
echo "📤 Step 3: Pushing code to repository..."
read -p "Push current branch to protocol-sdk remote? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    CURRENT_BRANCH=$(git branch --show-current)
    git push protocol-sdk $CURRENT_BRANCH
    echo -e "${GREEN}✓ Code pushed${NC}"
else
    echo -e "${YELLOW}⚠️  Skipped pushing code${NC}"
fi
echo ""

# Step 4: Configure branch protection
echo "🛡️  Step 4: Configuring branch protection..."
read -p "Set up branch protection for 'main'? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gh api repos/$FULL_REPO/branches/main/protection \
        -X PUT \
        -f required_status_checks[strict]=true \
        -f required_pull_request_reviews[required_approving_review_count]=1 \
        -f required_pull_request_reviews[dismiss_stale_reviews]=true \
        -f enforce_admins=true \
        -f required_conversation_resolution=true 2>/dev/null || true

    echo -e "${GREEN}✓ Branch protection configured${NC}"
else
    echo -e "${YELLOW}⚠️  Skipped branch protection${NC}"
fi
echo ""

# Step 5: Create labels
echo "🏷️  Step 5: Creating labels..."
read -p "Create project labels? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Type labels
    gh label create "type: feature" --color "0366d6" --description "New feature" --repo $FULL_REPO 2>/dev/null || true
    gh label create "type: bugfix" --color "d73a4a" --description "Bug fix" --repo $FULL_REPO 2>/dev/null || true
    gh label create "type: refactor" --color "fbca04" --description "Code refactoring" --repo $FULL_REPO 2>/dev/null || true
    gh label create "type: docs" --color "0075ca" --description "Documentation" --repo $FULL_REPO 2>/dev/null || true
    gh label create "type: test" --color "1d76db" --description "Testing" --repo $FULL_REPO 2>/dev/null || true

    # Priority labels
    gh label create "priority: high" --color "d93f0b" --description "High priority" --repo $FULL_REPO 2>/dev/null || true
    gh label create "priority: medium" --color "fbca04" --description "Medium priority" --repo $FULL_REPO 2>/dev/null || true
    gh label create "priority: low" --color "0e8a16" --description "Low priority" --repo $FULL_REPO 2>/dev/null || true

    # Phase labels
    gh label create "phase: 0" --color "f9d0c4" --description "Phase 0: Setup" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 1" --color "c5def5" --description "Phase 1: SDK Extraction" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 2" --color "bfdadc" --description "Phase 2: Pool Creation" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 3" --color "d4c5f9" --description "Phase 3: Missing Connectors" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 4" --color "c2e0c6" --description "Phase 4: Multi-Protocol" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 5" --color "fef2c0" --description "Phase 5: Optimization" --repo $FULL_REPO 2>/dev/null || true
    gh label create "phase: 6" --color "bfd4f2" --description "Phase 6: Documentation" --repo $FULL_REPO 2>/dev/null || true

    # Status labels
    gh label create "status: in-progress" --color "fbca04" --description "Work in progress" --repo $FULL_REPO 2>/dev/null || true
    gh label create "status: review" --color "0e8a16" --description "Ready for review" --repo $FULL_REPO 2>/dev/null || true
    gh label create "status: blocked" --color "d73a4a" --description "Blocked" --repo $FULL_REPO 2>/dev/null || true

    echo -e "${GREEN}✓ Labels created${NC}"
else
    echo -e "${YELLOW}⚠️  Skipped label creation${NC}"
fi
echo ""

# Step 6: Set repository settings
echo "⚙️  Step 6: Configuring repository settings..."
read -p "Configure repository settings? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gh api repos/$FULL_REPO \
        -X PATCH \
        -f has_issues=true \
        -f has_projects=true \
        -f has_wiki=false \
        -f allow_squash_merge=true \
        -f allow_merge_commit=false \
        -f allow_rebase_merge=true \
        -f delete_branch_on_merge=true 2>/dev/null || true

    echo -e "${GREEN}✓ Repository settings configured${NC}"
else
    echo -e "${YELLOW}⚠️  Skipped repository settings${NC}"
fi
echo ""

# Summary
echo "✅ Setup Complete!"
echo ""
echo "Repository: https://github.com/$FULL_REPO"
echo ""
echo "Next steps:"
echo "  1. Review the repository settings on GitHub"
echo "  2. Add team members (Settings → Collaborators)"
echo "  3. Add secrets (Settings → Secrets and variables → Actions)"
echo "  4. Begin Phase 1 development"
echo ""
echo "Documentation:"
echo "  • Project Plan: docs/Protocol_SDK_PLAN.md"
echo "  • Architecture: docs/architecture/ARCHITECTURE.md"
echo "  • Setup Guide: docs/REPOSITORY_SETUP.md"
echo ""
