#!/bin/bash

# Shopify Tag Automation - Server Setup Script
# Run this script on a fresh Ubuntu 22.04 Digital Ocean droplet

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_header() {
    echo -e "${BLUE}[SETUP]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root. Please run: sudo $0"
   exit 1
fi

print_header "Setting up Ubuntu server for Shopify Tag Automation..."

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 18
print_status "Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_status "Node.js version: $NODE_VERSION"
print_status "NPM version: $NPM_VERSION"

# Install PM2 globally
print_status "Installing PM2 process manager..."
npm install -g pm2

# Install Nginx
print_status "Installing Nginx..."
apt install nginx -y

# Install Git
print_status "Installing Git..."
apt install git -y

# Install UFW firewall
print_status "Configuring UFW firewall..."
apt install ufw -y
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# Install additional useful tools
print_status "Installing additional tools..."
apt install htop curl wget nano -y

# Create application user (optional, for security)
print_status "Creating application user..."
if ! id "shopify-app" &>/dev/null; then
    useradd -m -s /bin/bash shopify-app
    usermod -aG sudo shopify-app
    print_status "Created user 'shopify-app' with sudo privileges"
    print_warning "You may want to switch to this user for running the application"
fi

# Create application directory
print_status "Creating application directory..."
mkdir -p /var/www/shopify-automation
chown shopify-app:shopify-app /var/www/shopify-automation

# Enable and start services
print_status "Enabling services..."
systemctl enable nginx
systemctl start nginx
systemctl enable ufw

# Configure Nginx
print_status "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/shopify-automation << 'EOF'
server {
    listen 80;
    server_name _;  # Replace with your domain or IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/shopify-automation /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
nginx -t

# Restart Nginx
systemctl restart nginx

# Install Certbot for SSL
print_status "Installing Certbot for SSL certificates..."
apt install certbot python3-certbot-nginx -y

print_header "✅ Server setup completed successfully!"
print_status ""
print_status "Next steps:"
print_status "1. Clone your repository:"
print_status "   cd /var/www/shopify-automation"
print_status "   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git ."
print_status ""
print_status "2. Switch to application user (recommended):"
print_status "   su - shopify-app"
print_status ""
print_status "3. Run the deployment script:"
print_status "   ./deploy.sh"
print_status ""
print_status "4. Configure your domain in Nginx:"
print_status "   nano /etc/nginx/sites-available/shopify-automation"
print_status "   # Replace 'server_name _;' with your domain"
print_status ""
print_status "5. Get SSL certificate:"
print_status "   certbot --nginx -d your-domain.com"
print_status ""
print_status "6. Configure Shopify webhooks with your domain"
print_status ""
print_warning "Don't forget to:"
print_warning "- Update your .env file with real Shopify credentials"
print_warning "- Configure your domain name in Nginx"
print_warning "- Set up SSL certificate"
print_warning "- Test with a real Shopify order"
