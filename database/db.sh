#!/bin/bash
# Quick database management script
# Usage: ./db.sh [command]

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DB_NAME="nutritional_db"
DB_USER="nutritional_user"

case "${1:-help}" in
    start)
        echo "Starting PostgreSQL..."
        sudo systemctl start postgresql
        echo "✓ PostgreSQL started"
        ;;

    stop)
        echo "Stopping PostgreSQL..."
        sudo systemctl stop postgresql
        echo "✓ PostgreSQL stopped"
        ;;

    restart)
        echo "Restarting PostgreSQL..."
        sudo systemctl restart postgresql
        sleep 2
        echo "✓ PostgreSQL restarted"
        ;;

    status)
        sudo systemctl status postgresql --no-pager
        ;;

    connect)
        sudo -u postgres psql -d $DB_NAME
        ;;

    backup)
        BACKUP_FILE="$SCRIPT_DIR/backups/backup_$(date +%Y%m%d_%H%M%S).sql"
        mkdir -p "$SCRIPT_DIR/backups"
        echo "Creating backup: $BACKUP_FILE"
        sudo -u postgres pg_dump $DB_NAME > "$BACKUP_FILE"
        gzip "$BACKUP_FILE"
        echo "✓ Backup created: ${BACKUP_FILE}.gz"
        ;;

    restore)
        if [ -z "$2" ]; then
            echo "Error: Please specify backup file"
            echo "Usage: ./db.sh restore <backup_file>"
            exit 1
        fi
        echo "Restoring from: $2"
        if [[ $2 == *.gz ]]; then
            gunzip -c "$2" | sudo -u postgres psql $DB_NAME
        else
            sudo -u postgres psql $DB_NAME < "$2"
        fi
        echo "✓ Restore complete"
        ;;

    reset)
        echo "⚠ WARNING: This will delete ALL data!"
        read -p "Type 'yes' to confirm: " -r
        if [[ $REPLY == "yes" ]]; then
            echo "Dropping and recreating database..."
            sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
            sudo -u postgres psql -f "$SCRIPT_DIR/create_db.sql"
            sudo -u postgres psql -d $DB_NAME -f "$SCRIPT_DIR/init.sql"
            echo "✓ Database reset complete"
        else
            echo "Cancelled"
        fi
        ;;

    logs)
        PG_VERSION=$(ls /etc/postgresql/ | head -n1)
        sudo tail -f /var/log/postgresql/postgresql-${PG_VERSION}-main.log
        ;;

    size)
        sudo -u postgres psql -d $DB_NAME -c "
            SELECT
                pg_size_pretty(pg_database_size('$DB_NAME')) as database_size,
                (SELECT count(*) FROM food_items) as food_items,
                (SELECT count(*) FROM food_entries) as entries,
                (SELECT count(*) FROM daily_summaries) as summaries;
        "
        ;;

    vacuum)
        echo "Running VACUUM ANALYZE..."
        sudo -u postgres psql -d $DB_NAME -c "VACUUM ANALYZE;"
        echo "✓ Vacuum complete"
        ;;

    help|*)
        echo "Database Management Script"
        echo ""
        echo "Usage: ./db.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start     - Start PostgreSQL service"
        echo "  stop      - Stop PostgreSQL service"
        echo "  restart   - Restart PostgreSQL service"
        echo "  status    - Show PostgreSQL status"
        echo "  connect   - Open psql console"
        echo "  backup    - Create database backup"
        echo "  restore   - Restore from backup file"
        echo "  reset     - Drop and recreate database (DESTRUCTIVE!)"
        echo "  logs      - Tail PostgreSQL logs"
        echo "  size      - Show database size and statistics"
        echo "  vacuum    - Run VACUUM ANALYZE (maintenance)"
        echo "  help      - Show this help message"
        ;;
esac
