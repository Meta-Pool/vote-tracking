USER=metapool

# Calculate yesterday's date in YYYY-MM-DD format
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)

# Create directory for current month if it doesn't exist
CURRENT_MONTH=$(date +%Y-%m)
mkdir -p "$CURRENT_MONTH"

# Use rsync to download only files modified in the last 24 hours
# The --files-from option combined with ssh command to find recent files
rsync -auv --rsh='ssh -p2022' \
    --files-from=<(ssh -p2022 $USER@eth-metapool.narwallets.com "find /home/$USER/2025-08 -name '*.json' -newermt '$YESTERDAY' -printf '%P\n'") \
    $USER@eth-metapool.narwallets.com:/home/$USER/2025-08/ \
    ./2025-08/

