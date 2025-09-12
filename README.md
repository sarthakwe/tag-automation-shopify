# Shopify Tag Automation

An automated tagging system for Shopify orders that extracts charity information from product properties and adds it as a tag to the order.

## Overview

This application automatically processes Shopify order webhooks and extracts the "Choose your Charity" value from product properties, then adds that value as a tag to the order using the Shopify Admin API.

### Example Flow

When a customer orders a product with these properties:
- Choose your Charity: Act for kids
- Choose your Greeting: Write your Own
- Write your Own: Type your Custom Greeting message
- Select Font: Ashley Southine
- Select Font Size: 12 pts

The system will automatically add "Act for kids" as a tag to the order.

## Features

- ✅ Webhook verification for security
- ✅ Automatic charity extraction from product properties
- ✅ Order tagging via Shopify Admin API
- ✅ Health check endpoint
- ✅ Production-ready configuration
- ✅ Error handling and logging

## Prerequisites

- Node.js 18+ 
- Shopify store with Admin API access
- Digital Ocean droplet (for deployment)

## Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd shopify-tag-automation-shopify
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your Shopify credentials:

```env
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-admin-api-access-token
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret-key
PORT=3000
NODE_ENV=production
```

### 3. Shopify Configuration

#### Create Admin API Access Token

1. Go to your Shopify Admin → Apps → App and sales channel settings
2. Click "Develop apps" → "Create an app"
3. Configure Admin API access scopes:
   - `write_orders` (to update order tags)
   - `read_orders` (to read order data)
4. Install the app and copy the Admin API access token

#### Set Up Webhooks

1. Go to Settings → Notifications
2. Scroll to Webhooks section
3. Create webhook with these settings:
   - **Event**: Order creation
   - **URL**: `https://your-domain.com/webhook/orders/create`
   - **Format**: JSON
   - **API version**: 2024-01

4. (Optional) Create another webhook for order updates:
   - **Event**: Order updated
   - **URL**: `https://your-domain.com/webhook/orders/updated`
   - **Format**: JSON
   - **API version**: 2024-01

## Deployment to Digital Ocean Droplet

### Prerequisites
- Digital Ocean account
- Domain name (optional, you can use the droplet's IP)
- GitHub repository with your code

### Step 1: Create Digital Ocean Droplet

1. **Create a New Droplet**
   - Go to [Digital Ocean Control Panel](https://cloud.digitalocean.com/droplets)
   - Click "Create Droplet"
   - Choose **Ubuntu 22.04 LTS**
   - Select **Basic plan** with at least **1GB RAM** (recommended: 2GB)
   - Choose a datacenter region close to your users
   - Add your SSH key or create a root password
   - Give it a hostname like `shopify-automation`
   - Click "Create Droplet"

2. **Connect to Your Droplet**
   ```bash
   # Replace with your droplet's IP address
   ssh root@YOUR_DROPLET_IP
   ```

### Step 2: Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx for reverse proxy
sudo apt install nginx -y

# Install Git
sudo apt install git -y

# Install UFW firewall
sudo apt install ufw -y
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### Step 3: Deploy Your Application

```bash
# Create application directory
sudo mkdir -p /var/www/shopify-automation
sudo chown $USER:$USER /var/www/shopify-automation
cd /var/www/shopify-automation

# Clone your GitHub repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git .

# Install dependencies
npm ci --only=production

# Create environment file
cp env.example .env
nano .env
```

**Edit the `.env` file with your actual values:**
```env
# Shopify Configuration
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-admin-api-access-token
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret-key

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Step 4: Configure PM2 Process Manager

```bash
# Start the application with PM2
pm2 start server.js --name "shopify-tag-automation"

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
# Follow the instructions that appear (usually run a sudo command)

# Check if the app is running
pm2 status
pm2 logs shopify-tag-automation
```

### Step 5: Configure Nginx Reverse Proxy

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/shopify-automation
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

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
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/shopify-automation /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 6: Set Up SSL Certificate (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

### Step 7: Configure Shopify Webhooks

1. **Go to your Shopify Admin**
2. **Navigate to Settings → Notifications**
3. **Scroll to Webhooks section**
4. **Click "Create webhook"**
5. **Configure the webhook:**
   - **Event**: `Order creation`
   - **URL**: `https://your-domain.com/webhook/orders/create`
   - **Format**: `JSON`
   - **API version**: `2024-01`
6. **Click "Save webhook"**

**Optional: Create webhook for order updates:**
- **Event**: `Order updated`
- **URL**: `https://your-domain.com/webhook/orders/updated`
- **Format**: `JSON`
- **API version**: `2024-01`

### Step 8: Test Your Deployment

```bash
# Test health endpoint
curl http://your-domain.com/health

# Check application logs
pm2 logs shopify-tag-automation

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Step 9: Set Up Monitoring (Optional)

```bash
# Install monitoring tools
sudo apt install htop -y

# Create a simple monitoring script
nano /var/www/shopify-automation/monitor.sh
```

**Add this monitoring script:**
```bash
#!/bin/bash
# Simple health check script

HEALTH_URL="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): Application is healthy"
else
    echo "$(date): Application is down! Restarting..."
    pm2 restart shopify-tag-automation
fi
```

```bash
# Make it executable
chmod +x /var/www/shopify-automation/monitor.sh

# Add to crontab for regular checks
crontab -e
# Add this line to check every 5 minutes:
# */5 * * * * /var/www/shopify-automation/monitor.sh >> /var/log/shopify-automation-monitor.log 2>&1
```

### Step 10: Update Your Application

When you make changes to your code:

```bash
# Navigate to your app directory
cd /var/www/shopify-automation

# Pull latest changes
git pull origin main

# Install any new dependencies
npm ci --only=production

# Restart the application
pm2 restart shopify-tag-automation

# Check status
pm2 status
```

### Troubleshooting

**If the application won't start:**
```bash
# Check logs
pm2 logs shopify-tag-automation

# Check if port 3000 is in use
sudo netstat -tlnp | grep :3000

# Restart PM2
pm2 restart all
```

**If webhooks aren't working:**
```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test webhook endpoint manually
curl -X POST http://your-domain.com/webhook/orders/create \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**If you need to update environment variables:**
```bash
# Edit .env file
nano /var/www/shopify-automation/.env

# Restart application
pm2 restart shopify-tag-automation
```

## API Endpoints

### Health Check
```
GET /health
```
Returns application status and version information.

### Webhook Endpoints
```
POST /webhook/orders/create
POST /webhook/orders/updated
```
These endpoints receive Shopify webhook data and process orders.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SHOPIFY_SHOP_DOMAIN` | Your Shopify store domain (e.g., mystore.myshopify.com) | Yes |
| `SHOPIFY_ACCESS_TOKEN` | Admin API access token | Yes |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook secret for verification | Recommended |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

### Product Properties

The system looks for product properties with names containing "charity" (case-insensitive). Make sure your product properties follow this naming convention:

- ✅ "Choose your Charity"
- ✅ "Charity Selection"
- ✅ "charity"
- ❌ "Donation" (won't be detected)

## Monitoring

### Health Check
The application provides a health check endpoint at `/health` that returns:
- Application status
- Timestamp
- Version information

### Logs
Application logs are available via PM2:
```bash
pm2 logs shopify-tag-automation
```

### Monitoring Commands
```bash
# Check if application is running
curl http://localhost:3000/health

# View logs
pm2 logs shopify-tag-automation

# Check process status
pm2 status

# Restart application
pm2 restart shopify-tag-automation
```

## Troubleshooting

### Common Issues

1. **Webhook not receiving data**
   - Check webhook URL is accessible from internet
   - Verify webhook secret matches environment variable
   - Check Shopify webhook configuration

2. **Orders not being tagged**
   - Verify Admin API access token has `write_orders` scope
   - Check product properties contain "charity" in the name
   - Review application logs for errors

3. **Application not starting**
   - Check environment variables are set correctly
   - Verify port 3000 is available
   - Check PM2 process status: `pm2 status`

### Debug Mode

Enable debug logging by setting:
```bash
export DEBUG=shopify-tag-automation:*
```

## Security

- Webhook verification using HMAC-SHA256
- Security headers
- Environment variable protection
- PM2 process management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Create an issue in the repository

---

**Note**: This application uses Shopify Admin API version 2024-01. Make sure your Shopify store supports this API version.
