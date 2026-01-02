# Quick Reference - Database Commands

## Setup (One-time)

```bash
# Production (Debian/Ubuntu server)
cd database
sudo ./setup.sh
# ⚠ SAVE the generated password immediately!
# Password saved to: database/.db_password

# Copy password to .env, then delete the temp file
cat .db_password  # Copy this
nano ../.env      # Paste into DATABASE_URL
rm .db_password   # DELETE after copying

# Development (Windows/Mac with Docker)
docker-compose up -d  # (from project root)
# Note: Uses default password - for development only!
```

## Daily Operations

```bash
cd database

# Database management
./db.sh status      # Check if PostgreSQL is running
./db.sh connect     # Open psql console
./db.sh size        # Show database size and record counts

# Backups
./db.sh backup      # Create timestamped backup
./db.sh restore backup_20250101_120000.sql.gz

# Maintenance
./db.sh vacuum      # Optimize database (run weekly)

# Logs
./db.sh logs        # View PostgreSQL logs (Ctrl+C to exit)
```

## Troubleshooting

```bash
# Service control
./db.sh start
./db.sh stop
./db.sh restart

# Database reset (DESTRUCTIVE!)
./db.sh reset       # Drops and recreates database
```

## Python Integration

```python
# Test connection
from nutritional.database.connection import test_connection
print("✓ Connected" if test_connection() else "✗ Failed")

# Use storage
SQLModelStorage
```

## Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `init.sql` | Database schema | `database/init.sql` |
| `create_db.sql` | DB/user creation (prompts for password) | `database/create_db.sql` |
| `postgresql.conf.template` | Memory-optimized config | `database/postgresql.conf.template` |
| `pg_hba.conf.local` | Local-only security | `database/pg_hba.conf.local` |
| `setup.sh` | Automated setup | `database/setup.sh` |
| `db.sh` | Management script | `database/db.sh` |

## Security Features

✅ **Secure by Default:**
- Setup generates 32-byte random password
- PostgreSQL listens on localhost only (127.0.0.1)
- pg_hba.conf blocks all remote connections
- Application must run on same server
- No weak default passwords

✅ **Remote Admin via SSH Tunnel:**
```bash
# From your local machine
ssh -L 5432:localhost:5432 user@server

# Then connect to localhost
psql -h localhost -U nutritional_user -d nutritional_db
```

## Memory Settings (1GB RAM)

| Setting | Value | Purpose |
|---------|-------|---------|
| `shared_buffers` | 128MB | Primary cache |
| `work_mem` | 4MB | Per-query memory |
| `maintenance_work_mem` | 32MB | VACUUM, indexes |
| `max_connections` | 20 | Connection limit |

## Monitoring

```bash
# System resources
free -h                     # RAM usage
df -h                       # Disk usage
htop                        # Overall system

# PostgreSQL specific
./db.sh size                # Database size
sudo systemctl status postgresql  # Service status

# Active connections
sudo -u postgres psql -d nutritional_db -c "
  SELECT count(*) as connections
  FROM pg_stat_activity
  WHERE datname = 'nutritional_db';
"
```

## File Locations

**Debian/Ubuntu:**
- Config: `/etc/postgresql/15/main/`
- Data: `/var/lib/postgresql/15/main/`
- Logs: `/var/log/postgresql/`

**Docker:**
- Data: Named volume `nutritional_postgres_data`
- Logs: `docker-compose logs postgres`

## Help

- Full documentation: `database/README.md`
- Deployment guide: `database/DEPLOYMENT.md`
- Migration plan: `docs/migration-plan.md`
