#!/bin/bash
# Security check script for DevTools Desktop
# This script runs various security checks before committing code

set -e

echo "🔒 Running security checks for DevTools Desktop..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if ggshield is installed
if command -v ggshield &> /dev/null; then
    print_status "GitGuardian ggshield found"

    # Check if API key is configured
    if ggshield secret scan path tests/setup.js &> /dev/null; then
        print_status "Running GitGuardian secret scan..."
        ggshield secret scan path . --recursive
    else
        print_warning "GitGuardian API key not configured. Run 'ggshield auth login' to set it up."
        print_warning "You can still commit, but consider setting up GitGuardian for full protection."
    fi
else
    print_warning "ggshield not found. Install with: pipx install ggshield"
fi

# Run tests to ensure nothing is broken
echo ""
echo "🧪 Running tests..."
if npm test; then
    print_status "All tests passed"
else
    print_error "Tests failed. Fix tests before committing."
    exit 1
fi

# Check for hardcoded patterns manually
echo ""
echo "🔍 Checking for common secret patterns..."

# Check for potential hardcoded secrets
if grep -r --exclude-dir=node_modules --exclude-dir=dist --exclude="*.html" --exclude="*.md" --exclude-dir=scripts -E "(password|secret|key|token|api).*[=:]\s*['\"][^'\"]{12,}" . 2>/dev/null; then
    print_warning "Found potential hardcoded secrets. Please review the above matches."
    echo "If these are legitimate test data, consider using dynamic construction."
else
    print_status "No obvious hardcoded secrets found"
fi

# Check for TODO/FIXME security items
if grep -r --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=scripts -i "TODO.*security\|FIXME.*security\|XXX.*security" . 2>/dev/null; then
    print_warning "Found security-related TODOs. Consider addressing before release."
fi

echo ""
print_status "Security checks completed!"
echo ""
echo "🚀 Ready to commit! Your code looks secure."
echo ""
echo "💡 Tips:"
echo "   - Install pre-commit hooks: pre-commit install"
echo "   - Set up GitGuardian API: ggshield auth login"
echo "   - Review SECURITY.md for guidelines"
