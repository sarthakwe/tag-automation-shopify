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

## Deployment

### Digital Ocean Droplet Setup

1. **Create a Droplet**
   - Choose Ubuntu 22.04 LTS
   - Select appropriate size (1GB RAM minimum)
   - Enable monitoring

2. **Initial Server Setup**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 18
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
   
   # Install Nginx (optional, for reverse proxy)
   sudo apt install nginx -y
   ```

3. **Deploy Application**
   ```bash
   # Clone your repository
   git clone <your-repo-url>
   cd shopify-tag-automation-shopify
   
   # Install dependencies
   npm ci --only=production
   
   # Create .env file
   cp env.example .env
   nano .env  # Edit with your credentials
   
   # Start with PM2
   pm2 start server.js --name "shopify-tag-automation"
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx** (Optional but recommended)
   ```bash
   # Create nginx config
   sudo nano /etc/nginx/sites-available/shopify-tag-automation
   
   # Add this configuration:
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   
   # Enable the site
   sudo ln -s /etc/nginx/sites-available/shopify-tag-automation /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **Set Up SSL** (Recommended)
   ```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx -y
   
   # Get SSL certificate
   sudo certbot --nginx -d your-domain.com
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
