# Deployment Guide - Google Cloud E2-micro (1GB RAM)

This guide covers deploying the nutritional tracker to a Google Cloud Compute Engine E2-micro instance running Debian 12.

## Instance Specifications

- **Machine Type**: e2-micro
- **RAM**: 1 GB
- **vCPUs**: 2 shared cores
- **Disk**: 10-20 GB standard persistent disk
- **OS**: Debian 12 (Bookworm)
- **Region**: Choose closest to users

## Estimated Costs (as of 2025)

- E2-micro instance: ~$7/month (free tier eligible: 1 instance)
- Persistent disk 10GB: ~$0.40/month
- Network egress: Variable

## Initial Server Setup

### 1. Create Instance

```bash
gcloud compute instances create nutritional-server \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-standard \
    --tags=http-server,https-server
```

### 2. Configure Firewall

```bash
# Allow HTTP traffic
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 \
    --target-tags http-server

# Allow HTTPS traffic
gcloud compute firewall-rules create allow-https \
    --allow tcp:443 \
    --target-tags https-server

# (Optional) Allow custom port for development
gcloud compute firewall-rules create allow-dash \
    --allow tcp:8050 \
    --target-tags http-server
```

### 3. SSH Into Instance

```bash
gcloud compute ssh nutritional-server --zone=us-central1-a
```

## Server Configuration

### 1. Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Install Required Packages

```bash
# Install PostgreSQL
sudo apt install -y postgresql-15 postgresql-contrib-15

# Install Python and build tools
sudo apt install -y python3 python3-pip python3-venv git curl

# Install uv (fast Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.cargo/env
```

### 3. Configure Swap (Important for 1GB RAM)

```bash
# Create 1GB swap file
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h
```

### 4. Clone Repository

```bash
# Create app directory
mkdir -p ~/apps
cd ~/apps

# Clone repository (replace with your repo URL)
git clone https://github.com/yourusername/nutritional.git
cd nutritional
```

### 5. Set Up PostgreSQL

```bash
cd database
chmod +x setup.sh db.sh
sudo ./setup.sh
cd ..
```

This will:
- Create database and user with **secure randomly-generated password**
- Apply optimized configuration for 1GB RAM
- **Configure local-only access** (blocks all remote connections)
- Initialize schema
- Restart PostgreSQL

**Important**: The script will generate and display a secure password. Save it immediately!

### 6. Configure Application

```bash
# Copy environment template
cp .env.example .env

# Edit with your settings
nano .env
```

**Critical settings to update:**
```bash
# Use the password from setup.sh (saved in database/.db_password)
DATABASE_URL=postgresql://nutritional_user:YOUR_GENERATED_PASSWORD@localhost:5432/nutritional_db

# SECURITY: Use localhost - app and DB are on same server
# Remote connections are BLOCKED by default

# Set Google Sheets ID if using visualization
GOOGLE_SHEETS_ID=your_sheet_id_here

# Production settings
ENV=production
DASH_DEBUG=False
DASH_HOST=0.0.0.0
DASH_PORT=8050
```

**After updating .env:**
```bash
# Delete the temporary password file
rm database/.db_password
```

### 7. Set Up Python Environment

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies with uv (faster)
uv pip install -e .

# Or use pip
pip install -e .
```

### 8. Upload Google Sheets Credentials

```bash
# On your local machine:
gcloud compute scp credentials/nutritional-*.json \
    nutritional-server:~/apps/nutritional/credentials/ \
    --zone=us-central1-a

# Or use scp/sftp directly
```

### 9. Test Application

```bash
# Activate environment
source .venv/bin/activate

# Test database connection
python -c "from nutritional.database.connection import test_connection; print('✓ Connected' if test_connection() else '✗ Failed')"

# Run application (test mode)
uv run -m nutritional
```

Visit `http://YOUR_INSTANCE_IP:8050` to verify it works.

## Production Deployment

### Option 1: Systemd Service (Recommended)

Create `/etc/systemd/system/nutritional.service`:

```ini
[Unit]
Description=Nutritional Tracker Dashboard
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=your_username
Group=your_username
WorkingDirectory=/home/your_username/apps/nutritional
Environment="PATH=/home/your_username/apps/nutritional/.venv/bin"
ExecStart=/home/your_username/apps/nutritional/.venv/bin/python -m nutritional
Restart=always
RestartSec=10
StandardOutput=append:/var/log/nutritional/app.log
StandardError=append:/var/log/nutritional/error.log

[Install]
WantedBy=multi-user.target
```

Set up and start:

```bash
# Create log directory
sudo mkdir -p /var/log/nutritional
sudo chown your_username:your_username /var/log/nutritional

# Enable and start service
sudo systemctl enable nutritional
sudo systemctl start nutritional
sudo systemctl status nutritional
```

### Option 2: Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/nutritional`:

```nginx
server {
    listen 80;
    server_name your_domain.com;  # or your_instance_ip

    location / {
        proxy_pass http://127.0.0.1:8050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/nutritional /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Option 3: SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (requires domain name)
sudo certbot --nginx -d your_domain.com

# Auto-renewal is configured automatically
```

## Monitoring and Maintenance

### Check Application Status

```bash
# Service status
sudo systemctl status nutritional

# View logs
sudo tail -f /var/log/nutritional/app.log
sudo journalctl -u nutritional -f
```

### Database Maintenance

```bash
cd ~/apps/nutritional/database

# Check database size
./db.sh size

# Create backup
./db.sh backup

# Run maintenance
./db.sh vacuum
```

### Monitor System Resources

```bash
# Overall system
htop

# Memory usage
free -h

# PostgreSQL memory
ps aux | grep postgres | awk '{sum+=$6} END {print "PostgreSQL: " sum/1024 " MB"}'

# Disk usage
df -h
```

### Automatic Backups

Create `/etc/cron.daily/backup-nutritional-db`:

```bash
#!/bin/bash
cd /home/your_username/apps/nutritional/database
./db.sh backup
# Keep only last 7 days
find backups/ -name "*.sql.gz" -mtime +7 -delete
```

Make executable:

```bash
sudo chmod +x /etc/cron.daily/backup-nutritional-db
```

## Performance Optimization

### 1. PostgreSQL Tuning (Already Applied)

The setup script configures:
- `shared_buffers = 128MB`
- `work_mem = 4MB`
- `max_connections = 20`
- `maintenance_work_mem = 32MB`

### 2. Python Application

Add to `.env`:
```bash
# Disable debug mode
DASH_DEBUG=False

# Use production settings
ENV=production
```

### 3. Gunicorn (Production WSGI Server)

Install:
```bash
pip install gunicorn
```

Update systemd service ExecStart:
```bash
ExecStart=/home/your_username/apps/nutritional/.venv/bin/gunicorn \
    --workers 2 \
    --bind 127.0.0.1:8050 \
    --timeout 60 \
    nutritional.app:server
```

## Troubleshooting

### Out of Memory

Check if swap is active:
```bash
free -h
sudo swapon -s
```

Reduce PostgreSQL connections:
```bash
sudo nano /etc/postgresql/15/main/conf.d/nutritional.conf
# Set: max_connections = 10
sudo systemctl restart postgresql
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -d nutritional_db -c "SELECT count(*) FROM pg_stat_activity;"

# Check logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### Application Won't Start

```bash
# Check logs
sudo journalctl -u nutritional -n 50

# Test manually
cd ~/apps/nutritional
source .venv/bin/activate
uv run -m nutritional
```

## Updating Application

```bash
cd ~/apps/nutritional

# Pull latest code
git pull

# Update dependencies
source .venv/bin/activate
uv pip install -e .

# Restart service
sudo systemctl restart nutritional
```

## Security Checklist

- [x] Secure random password generated automatically
- [x] PostgreSQL listens on localhost only
- [x] Remote connections blocked (pg_hba.conf)
- [x] Application and database on same server
- [ ] Uploaded Google Sheets credentials
- [ ] Configured firewall rules
- [ ] Set up SSL/TLS with Let's Encrypt (optional for external access)
- [ ] Set up automatic security updates
- [ ] Regular backups configured
- [ ] Monitoring alerts set up

## Remote Database Administration

Since remote connections are blocked for security, use SSH tunneling for remote admin:

```bash
# From your local machine
ssh -L 5432:localhost:5432 user@your-server

# In another terminal, connect to localhost
psql -h localhost -p 5432 -U nutritional_user -d nutritional_db
```

Or use tools like pgAdmin with SSH tunnel configuration.

## Cost Optimization

1. **Use free tier**: First e2-micro instance is free
2. **Snapshot instead of backup**: Take disk snapshots for full system backup
3. **Clean old data**: Regularly remove old entries if not needed
4. **Monitor egress**: Most operations use minimal bandwidth

## Support

- PostgreSQL docs: https://www.postgresql.org/docs/15/
- Google Cloud docs: https://cloud.google.com/compute/docs
- Debian docs: https://www.debian.org/doc/
