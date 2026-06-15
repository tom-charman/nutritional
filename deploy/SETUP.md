# First-Time VM Setup — Google Cloud E2-micro (1 GB RAM)

One-time provisioning of a fresh VM to run the nutritional tracker (PostgreSQL +
nginx + the Next.js app) on a Google Cloud Compute Engine E2-micro instance
running Debian 12.

Do this **once**. To push a new build to an already-provisioned VM, you don't
need any of this — see [`README.md`](README.md) (routine deploy).

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

## 1. Create the instance

```bash
gcloud compute instances create nutritional-server \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-standard \
    --tags=http-server,https-server

# Firewall
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 --target-tags http-server
gcloud compute firewall-rules create allow-https \
    --allow tcp:443 --target-tags https-server

# SSH in
gcloud compute ssh nutritional-server --zone=us-central1-a
```

## 2. System prep

```bash
sudo apt update && sudo apt upgrade -y

# Packages: PostgreSQL, nginx, git, curl, certbot
sudo apt install -y postgresql-15 postgresql-contrib-15 nginx git curl \
    certbot python3-certbot-nginx

# Node 22 LTS (runs the app)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
```

### Swap (important for 1 GB RAM)

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # verify
```

## 3. PostgreSQL

Clone the repo (for the database scripts) and run the setup script:

```bash
mkdir -p ~/src && cd ~/src
git clone https://github.com/yourusername/nutritional.git
cd nutritional/database
chmod +x setup.sh db.sh
sudo ./setup.sh
```

This creates the database and user with a secure random password, applies the
1 GB-tuned config and local-only access (`pg_hba.conf`), and initializes the
schema. See [`../database/README.md`](../database/README.md) for details and
manual steps. **Save the generated password** (`database/.db_password`) — it
goes into the app `.env` in the next step, then delete the temp file.

## 4. App directories + environment

```bash
mkdir -p ~/apps/nutritional/{releases,shared}
sudo mkdir -p /var/log/nutritional && sudo chown $USER /var/log/nutritional

# Create the env file from the template and fill in real values
cp ~/src/nutritional/.env.example ~/apps/nutritional/shared/.env
chmod 600 ~/apps/nutritional/shared/.env
```

Required values (see [`../.env.example`](../.env.example)):

| var | notes |
|---|---|
| `DATABASE_URL` | `postgresql://nutritional_user:<pw>@127.0.0.1:5432/nutritional_db` (pw from step 3) |
| `AUTH_SECRET` | `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `AUTH_URL` | public URL, e.g. `https://your-domain` |
| `AUTH_TRUST_HOST` | `true` (behind nginx) |
| `AUTHORIZED_EMAILS` | comma-separated sign-in allowlist |

Add `https://<your-domain>/api/auth/callback/google` as an authorized redirect
URI on the Google OAuth client.

## 5. systemd service

```bash
# From the cloned repo; edit YOUR_USER first
sudo cp ~/src/nutritional/deploy/nutritional-next.service /etc/systemd/system/
sudoedit /etc/systemd/system/nutritional-next.service   # set YOUR_USER
sudo systemctl daemon-reload
sudo systemctl enable nutritional-next
```

The unit runs `node server.js` from `~/apps/nutritional/current`, loads
`shared/.env`, and caps memory so a Node leak can't OOM PostgreSQL. It won't
start successfully until the first release is deployed (step 9).

## 6. Nginx reverse proxy

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

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nutritional /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 7. SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your_domain.com   # auto-renewal is configured for you
```

## 8. Nightly backups

```bash
sudo cp ~/src/nutritional/deploy/nutritional-backup.sh /usr/local/bin/nutritional-backup.sh
sudo chmod 755 /usr/local/bin/nutritional-backup.sh
sudo crontab -e
# add: 0 2 * * * /usr/local/bin/nutritional-backup.sh >> /var/log/nutritional/backup.log 2>&1
```

Validates each dump and keeps the 14 most recent in `~/backups` — see
[`README.md`](README.md#backups).

## 9. First deploy

The VM is now ready. Ship the first release from your workstation/CI — see
[`README.md`](README.md#ship-a-release) — then run the
[smoke test](README.md#smoke-test-a-deploy).

## Security Checklist

- [x] Secure random password generated automatically
- [x] PostgreSQL listens on localhost only
- [x] Remote connections blocked (pg_hba.conf)
- [x] Application and database on same server
- [ ] Configured firewall rules
- [ ] Set up SSL/TLS with Let's Encrypt
- [ ] Set up automatic security updates
- [ ] Regular backups configured

## Remote Database Administration

Remote connections are blocked, so use an SSH tunnel for remote admin:

```bash
# From your local machine
ssh -L 5432:localhost:5432 user@your-server
# then, in another terminal
psql -h localhost -p 5432 -U nutritional_user -d nutritional_db
```

## Cost Optimization

1. **Use free tier**: First e2-micro instance is free
2. **Snapshot instead of backup**: Take disk snapshots for full system backup
3. **Monitor egress**: Most operations use minimal bandwidth

## Support

- PostgreSQL docs: https://www.postgresql.org/docs/15/
- Google Cloud docs: https://cloud.google.com/compute/docs
- Debian docs: https://www.debian.org/doc/
