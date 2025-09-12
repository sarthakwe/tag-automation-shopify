# Complete Deployment Guide: GitHub to Digital Ocean

This guide will walk you through deploying your Shopify Tag Automation from GitHub to a Digital Ocean droplet.

## Prerequisites

- Digital Ocean account
- GitHub repository with your code
- Domain name (optional, you can use the droplet's IP)
- Basic knowledge of command line

## Step 1: Create Digital Ocean Droplet

1. **Go to Digital Ocean Control Panel**
   - Visit [https://cloud.digitalocean.com/droplets](https://cloud.digitalocean.com/droplets)
   - Click "Create Droplet"

2. **Choose Configuration**
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic (1GB RAM minimum, 2GB recommended)
   - **Datacenter**: Choose closest to your users
   - **Authentication**: Add SSH key or use password
   - **Hostname**: `shopify-automation`
   - Click "Create Droplet"

3. **Note Your Droplet Details**
   - IP Address: `YOUR_DROPLET_IP`
   - Root password (if using password auth)

## Step 2: Initial Server Setup

1. **Connect to Your Droplet**
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

2. **Run the Setup Script**
   ```bash
   # Download and run the setup script
   wget https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/setup-server.sh
   chmod +x setup-server.sh
   sudo ./setup-server.sh
   ```

   Or manually run the setup commands from the README.md

## Step 3: Deploy Your Application

1. **Clone Your Repository**
   ```bash
   cd /var/www/shopify-automation
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git .
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   nano .env
   ```

   Update the `.env` file with your actual Shopify credentials:
   ```env
   SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
   SHOPIFY_ACCESS_TOKEN=your-admin-api-access-token
   SHOPIFY_WEBHOOK_SECRET=your-webhook-secret-key
   PORT=3000
   NODE_ENV=production
   ```

3. **Deploy the Application**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

## Step 4: Configure Domain and SSL (Optional but Recommended)

1. **Point Your Domain to the Droplet**
   - Add an A record in your DNS settings
   - Point your domain to `YOUR_DROPLET_IP`

2. **Update Nginx Configuration**
   ```bash
   sudo nano /etc/nginx/sites-available/shopify-automation
   ```
   
   Change `server_name _;` to `server_name your-domain.com;`

3. **Get SSL Certificate**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

## Step 5: Configure Shopify Webhooks

1. **Go to Shopify Admin**
   - Navigate to Settings → Notifications
   - Scroll to Webhooks section

2. **Create Order Creation Webhook**
   - **Event**: Order creation
   - **URL**: `https://your-domain.com/webhook/orders/create`
   - **Format**: JSON
   - **API version**: 2024-01

3. **Create Order Update Webhook (Optional)**
   - **Event**: Order updated
   - **URL**: `https://your-domain.com/webhook/orders/updated`
   - **Format**: JSON
   - **API version**: 2024-01

## Step 6: Test Your Deployment

1. **Test Health Endpoint**
   ```bash
   curl https://your-domain.com/health
   ```

2. **Check Application Logs**
   ```bash
   pm2 logs shopify-tag-automation
   ```

3. **Test with a Real Order**
   - Create a test order in your Shopify store
   - Check if the order gets tagged with the charity value

## Step 7: Set Up Automated Deployment (Optional)

1. **Add GitHub Secrets**
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Add these secrets:
     - `HOST`: Your droplet's IP address
     - `USERNAME`: Your server username (usually `root` or `shopify-app`)
     - `SSH_KEY`: Your private SSH key

2. **Push to Main Branch**
   - Any push to the main branch will automatically deploy
   - Or use the "Actions" tab to manually trigger deployment

## Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs shopify-tag-automation

# Check if port is in use
sudo netstat -tlnp | grep :3000

# Restart PM2
pm2 restart all
```

### Webhooks Not Working
```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test webhook endpoint
curl -X POST https://your-domain.com/webhook/orders/create \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### SSL Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate
sudo certbot renew
```

## Monitoring and Maintenance

### Regular Tasks
- Monitor application logs: `pm2 logs shopify-tag-automation`
- Check system resources: `htop`
- Update system packages: `sudo apt update && sudo apt upgrade`

### Backup
- Your code is already backed up in GitHub
- Consider backing up your `.env` file separately
- PM2 configuration is saved with `pm2 save`

## Security Considerations

1. **Firewall**: UFW is configured to only allow SSH and HTTP/HTTPS
2. **SSL**: Use HTTPS for all webhook endpoints
3. **Environment Variables**: Keep your `.env` file secure
4. **Regular Updates**: Keep your system and dependencies updated

## Cost Estimation

- **Digital Ocean Droplet**: $6-12/month (1-2GB RAM)
- **Domain**: $10-15/year (optional)
- **SSL Certificate**: Free with Let's Encrypt
- **Total**: ~$6-12/month

## Support

If you encounter issues:
1. Check the logs: `pm2 logs shopify-tag-automation`
2. Review the troubleshooting section
3. Check Digital Ocean droplet status
4. Verify Shopify webhook configuration

---

**Congratulations!** Your Shopify Tag Automation is now deployed and ready to process orders automatically! 🎉
