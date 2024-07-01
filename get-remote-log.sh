USER=metapool
rsync -auv --rsh='ssh -p2022' $USER@eth-metapool.narwallets.com:/home/$USER/hourly-cron.log dist

