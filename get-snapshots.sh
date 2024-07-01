USER=metapool
rsync -auv --rsh='ssh -p2022' $USER@eth-metapool.narwallets.com:/home/$USER/2024-07 .

