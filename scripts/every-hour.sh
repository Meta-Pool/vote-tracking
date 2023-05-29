#!/bin/bash
LOGFILE=~/hourly-cron.log
echo ------------- >>$LOGFILE
date  >>$LOGFILE
# echo PATH=$PATH >>$LOGFILE
set +e
echo `date` before call vote-tracking >>$LOGFILE
node repos/metapool/vote-tracking/dist/main.js >>$LOGFILE 2>&1
echo `date` after call vote-tracking >>$LOGFILE
# cut logfile
tail -2000 $LOGFILE >$LOGFILE.tmp
mv $LOGFILE.tmp $LOGFILE
