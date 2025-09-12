#!/bin/bash

# Shopify Tag Automation - Deployment Script
# Run this script on your Digital Ocean droplet after initial setup

set -e  # Exit on any error

echo "🚀 Starting Shopify Tag Automation deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Please install PM2 first: sudo npm install -g pm2"
    exit 1
fi

# Get current directory
APP_DIR=$(pwd)
print_status "Deploying from: $APP_DIR"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
npm ci --only=production

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from env.example..."
    if [ -f "env.example" ]; then
        cp env.example .env
        print_warning "Please edit .env file with your actual Shopify credentials:"
        print_warning "nano .env"
        read -p "Press Enter after you've updated the .env file..."
    else
        print_error "env.example file not found. Please create .env file manually."
        exit 1
    fi
fi

# Stop existing PM2 process if running
print_status "Stopping existing PM2 process..."
pm2 stop shopify-tag-automation 2>/dev/null || true
pm2 delete shopify-tag-automation 2>/dev/null || true

# Start application with PM2
print_status "Starting application with PM2..."
pm2 start server.js --name "shopify-tag-automation"

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Show PM2 status
print_status "PM2 Status:"
pm2 status

# Show application logs
print_status "Application logs (last 20 lines):"
pm2 logs shopify-tag-automation --lines 20

# Test health endpoint
print_status "Testing health endpoint..."
sleep 2
if curl -s http://localhost:3000/health > /dev/null; then
    print_status "✅ Application is running successfully!"
    print_status "Health check response:"
    curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health
else
    print_error "❌ Health check failed. Check the logs above for errors."
    exit 1
fi

print_status "🎉 Deployment completed successfully!"
print_status ""
print_status "Next steps:"
print_status "1. Configure Nginx reverse proxy (see README.md)"
print_status "2. Set up SSL certificate with Certbot"
print_status "3. Configure Shopify webhooks with your domain"
print_status "4. Test with a real order"
print_status ""
print_status "Useful commands:"
print_status "- View logs: pm2 logs shopify-tag-automation"
print_status "- Restart app: pm2 restart shopify-tag-automation"
print_status "- Check status: pm2 status"
print_status "- Monitor: pm2 monit"
