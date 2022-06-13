#!/bin/bash

sudo apt-get update

sudo apt-get install -y \
    git               \
    python3-pip       \
    restic            \
    fd-find           \
    shellcheck        \
    restic            \
    tmux              \
    silversearcher-ag \
    flameshot         \
    tldr              \
    gitk 

    # TODO vim nvim
    




# Tidy-Viewer Afficher .csv dans terminal
wget https://github.com/alexhallam/tv/releases/download/1.4.3/tidy-viewer_1.4.3_amd64.deb

get_latest_release() {
  curl --silent "https://api.github.com/repos/$1/releases/latest" | # Get latest release from GitHub api
    grep '"tag_name":' |                                            # Get tag line
    sed -E 's/.*"([^"]+)".*/\1/'                                    # Pluck JSON value
}
version=$(get_latest_release "alexhallam/tv")

echo "$version"

