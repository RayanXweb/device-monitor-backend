#!/bin/bash

echo "🚀 Deploying Device Monitor Backend to Vercel..."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
if [[ $(echo "$NODE_VERSION 18.0.0" | tr " " "\n" | sort -V | head -n1) != "18.0.0" ]]; then
    echo -e "${RED}Node.js version 18+ required. Current: $NODE_VERSION${NC}"
    exit 1
fi

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
npm ci --production=false

# Run linting
echo -e "${GREEN}Running linting...${NC}"
npm run lint || echo -e "${YELLOW}Linting warnings found${NC}"

# Run tests
echo -e "${GREEN}Running tests...${NC}"
npm test || echo -e "${YELLOW}Tests failed but continuing${NC}"

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Installing Vercel CLI...${NC}"
    npm install -g vercel
fi

# Set environment variables
echo -e "${GREEN}Setting environment variables...${NC}"
vercel env add MONGODB_URI production
vercel env add JWT_SECRET production
vercel env add JWT_REFRESH_SECRET production
vercel env add REDIS_URL production
vercel env add FRONTEND_URL production

# Deploy to Vercel
echo -e "${GREEN}Deploying to Vercel...${NC}"
vercel --prod

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi
