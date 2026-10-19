#!/bin/sh
# Stop and remove the home bridge launchd agent (config and logs are kept).
set -eu
LABEL="com.appart3d.home-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Désinstallé ($PLIST supprimé). Config conservée : ~/.config/appart3d/home.json"
