# Apollo's Table — Deployment Guide

## What You Need

### From your buddy (Proxmox admin):
- [ ] LXC container or VM — Ubuntu 22.04, 1GB RAM, 10GB disk
- [ ] SSH access to the container via VPN
- [ ] Ports 80 and 443 forwarded from the public IP to the container's internal IP
- [ ] The public IP address (for DNS)

### From your domain registrar (wherever apollostable.com is managed):
- [ ] Point `apollostable.com` A record → public IP
- [ ] Point `www.apollostable.com` A record → public IP (or CNAME to apollostable.com)

---

## Step 1: Connect

VPN into your buddy's network, then SSH to the container:

```bash
ssh your-user@container-ip
```

---

## Step 2: Install Dependencies

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs git nginx certbot python3-certbot-nginx
```

Verify:
```bash
node -v   # should show v22.x
npm -v    # should show 10.x
```

---

## Step 3: Clone and Build

```bash
cd /opt
sudo git clone https://github.com/ApollosTable/apollos-table.git
sudo chown -R $USER:$USER apollos-table
cd apollos-table
git checkout feat/phase1-operations-platform

# Install backend deps
npm install

# Install and build frontend
cd app && npm install && npm run build && cd ..
```

Verify the build:
```bash
ls app/dist/index.html   # should exist
```

---

## Step 4: Create .env

```bash
nano /opt/apollos-table/.env
```

Paste this (fill in your values):

```
ANTHROPIC_API_KEY=your-anthropic-key

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=blake.a.corbit@gmail.com
SMTP_PASS=your-gmail-app-password

CONTACT_EMAIL=blake.a.corbit@gmail.com
CONTACT_PHONE=603-732-3032
ALERT_EMAIL=blake.a.corbit@gmail.com

PORT=3000
EMAIL_RATE_LIMIT=50
```

You can grab these values from your Windows machine at:
`C:\Users\Blake\Projects\apollos-table\.env`

---

## Step 5: Test It

```bash
cd /opt/apollos-table
node server.js
```

You should see:
```
Apollo's Table server listening on port 3000
[jobs] Scheduling background jobs...
```

Hit Ctrl+C to stop — we'll set up auto-start next.

---

## Step 6: Create Systemd Service

This makes the app start on boot and restart on crash.

```bash
sudo tee /etc/systemd/system/apollo.service << 'SERVICEEOF'
[Unit]
Description=Apollo's Table Operations Platform
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/apollos-table
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Run as a dedicated user for security
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
SERVICEEOF
```

Set permissions and start:
```bash
# Let www-data own the app directory
sudo chown -R www-data:www-data /opt/apollos-table

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable apollo
sudo systemctl start apollo

# Check it's running
sudo systemctl status apollo
```

You should see "active (running)". If not:
```bash
sudo journalctl -u apollo -n 50 --no-pager
```

---

## Step 7: Nginx Reverse Proxy

Nginx sits in front of Express and handles SSL.

```bash
sudo tee /etc/nginx/sites-available/apollo << 'NGINXEOF'
server {
    listen 80;
    server_name apollostable.com www.apollostable.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/apollo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config and restart
sudo nginx -t
sudo systemctl restart nginx
```

At this point, http://apollostable.com should show the dashboard (once DNS propagates).

---

## Step 8: SSL Certificate

**Wait until DNS has propagated** (check with `dig apollostable.com` — should show your public IP).

```bash
sudo certbot --nginx -d apollostable.com -d www.apollostable.com
```

Follow the prompts. Certbot will:
- Get a free Let's Encrypt certificate
- Auto-configure Nginx for HTTPS
- Set up auto-renewal

Verify HTTPS works: https://apollostable.com

---

## Updating the App

When you push new code:

```bash
# VPN in, SSH to container
cd /opt/apollos-table
sudo -u www-data git pull
sudo -u www-data npm install
cd app && sudo -u www-data npm install && sudo -u www-data npm run build && cd ..
sudo systemctl restart apollo
```

---

## Troubleshooting

**App won't start:**
```bash
sudo journalctl -u apollo -n 50 --no-pager
```

**Nginx errors:**
```bash
sudo nginx -t
sudo tail -20 /var/log/nginx/error.log
```

**Check if app is listening:**
```bash
curl http://localhost:3000/api/stats
```

**Check SSL cert renewal:**
```bash
sudo certbot renew --dry-run
```

**Database backup location (on the container):**
Backups go to the www-data user's home. You may want to change the backup path in `shared/jobs.js` to a location that gets synced off the server.

---

## Architecture

```
Internet
  │
  ▼
Firewall (ports 80/443)
  │
  ▼
Nginx (SSL termination + reverse proxy)
  │
  ▼
Express server (:3000)
  ├── React dashboard (app/dist/)
  ├── REST API (/api/*)
  ├── SQLite database (apollo.db)
  └── Background jobs (cron)
```

---

## Security Notes

- .env contains secrets — never commit it (it's in .gitignore)
- The dashboard has no authentication yet — anyone with the URL can access it. Add auth before going live, or keep it behind the VPN only and use a separate public-facing site for reports.
- SSL via Let's Encrypt auto-renews every 90 days
- The app runs as www-data (not root)
