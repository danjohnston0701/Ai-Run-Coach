#!/bin/bash
set -e

echo "🏃 AI Run Coach - Garmin SDK Installation Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Checking system...${NC}"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is for macOS only"
    exit 1
fi

echo "✅ macOS detected"
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Homebrew not found. Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "✅ Homebrew installed"
fi
echo ""

echo -e "${BLUE}Step 2: Downloading Garmin Connect IQ SDK...${NC}"
echo ""
echo "Please download the SDK manually:"
echo "1. Visit: https://developer.garmin.com/connect-iq/sdk/"
echo "2. Click 'Download SDK' for macOS"
echo "3. Save to ~/Downloads"
echo ""
read -p "Press Enter once you've downloaded the SDK..."
echo ""

# Find the downloaded SDK
SDK_ZIP=$(find ~/Downloads -name "connectiq-sdk-mac-*.zip" -type f | head -n 1)

if [ -z "$SDK_ZIP" ]; then
    echo "❌ Could not find SDK zip file in ~/Downloads"
    echo "Please ensure the file is named: connectiq-sdk-mac-*.zip"
    exit 1
fi

echo "✅ Found SDK: $(basename "$SDK_ZIP")"
echo ""

echo -e "${BLUE}Step 3: Installing SDK...${NC}"
echo ""

# Create directory if it doesn't exist
mkdir -p ~/Developer

# Extract SDK
SDK_DIR=$(basename "$SDK_ZIP" .zip)
cd ~/Downloads
unzip -q "$SDK_ZIP"

# Move to ~/Developer
echo "Moving SDK to ~/Developer/connectiq..."
rm -rf ~/Developer/connectiq
mv "$SDK_DIR" ~/Developer/connectiq

echo "✅ SDK installed to ~/Developer/connectiq"
echo ""

echo -e "${BLUE}Step 4: Adding SDK to PATH...${NC}"
echo ""

# Add to PATH in .zshrc if not already there
if ! grep -q "Developer/connectiq/bin" ~/.zshrc; then
    echo '' >> ~/.zshrc
    echo '# Garmin Connect IQ SDK' >> ~/.zshrc
    echo 'export PATH=$PATH:~/Developer/connectiq/bin' >> ~/.zshrc
    echo 'export MB_HOME=~/Developer/connectiq' >> ~/.zshrc
    echo "✅ Added to ~/.zshrc"
else
    echo "✅ Already in ~/.zshrc"
fi
echo ""

# Export for current session
export PATH=$PATH:~/Developer/connectiq/bin
export MB_HOME=~/Developer/connectiq

echo -e "${BLUE}Step 5: Verifying installation...${NC}"
echo ""

# Test monkeyc
if ~/Developer/connectiq/bin/monkeyc --version &> /dev/null; then
    echo "✅ monkeyc installed successfully"
    ~/Developer/connectiq/bin/monkeyc --version
else
    echo "❌ monkeyc installation failed"
    exit 1
fi
echo ""

# Test connectiq simulator
if [ -f ~/Developer/connectiq/bin/connectiq ]; then
    echo "✅ Connect IQ simulator available"
else
    echo "⚠️  Simulator not found (optional)"
fi
echo ""

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✅ Garmin SDK Installation Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Close and reopen your terminal (or run: source ~/.zshrc)"
echo "2. Verify with: monkeyc --version"
echo "3. Run: ./build-watch-app.sh"
echo ""
echo "Optional: Install VS Code extension"
echo "  - Open VS Code"
echo "  - Press Cmd+Shift+X"
echo "  - Search for 'Monkey C'"
echo "  - Install the Garmin Monkey C extension"
echo ""
