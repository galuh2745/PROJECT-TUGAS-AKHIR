#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

APP_NAME="aswisentosa-app"
APP_DIR="/home/aswisentosalampung/projects/aswisentosa"
DB_NAME="db_cvaswisentosa"
BACKUP_DIR="/home/aswisentosalampung/db_backups"

mkdir -p $BACKUP_DIR

TIMESTAMP=$(date +%F_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

echo "🚀 DEPLOY STARTED - $(date)"

cd $APP_DIR

echo "📥 Pull latest code"
git checkout -- .
git pull origin main

echo "📦 Install dependency"
npm ci

echo "💾 Backup database"
mysqldump $DB_NAME > $BACKUP_FILE

echo "🧹 Delete backups older than 7 days"
find $BACKUP_DIR -type f -mtime +7 -name "*.sql" -delete

echo "🔄 Prisma generate"
npx prisma generate

echo "🗄 Prisma migrate"
if ! npx prisma migrate deploy; then
  echo "❌ Migration failed!"
  echo "🔁 Restoring database..."

  mysql $DB_NAME < $BACKUP_FILE

  echo "⛔ Rollback done. Stop deploy."
  exit 1
fi

echo "🏗 Build NextJS"
npm run build

echo "♻ PM2 reload"
pm2 reload $APP_NAME
pm2 save

echo "✅ DEPLOY SUCCESS - $(date)"
