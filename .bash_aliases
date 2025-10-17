# =============================================================================
# Navigation Shortcuts
# =============================================================================
alias ..="cd .."
alias ...="cd ../.."
alias r="cd ~/Repos"
alias doc="cd ~/Documents"
alias donn="cd ~/Donnees"
alias dow="cd ~/Downloads"
alias des="cd ~/Desktop"

# =============================================================================
# File & Terminal Management
# =============================================================================
alias rm="trash-put -i"
# alias rm="rm -i"
alias ls="exa"
alias ll="exa -l"
alias l="exa -la"
alias lt="exa -lT"
alias cat="batcat -p"
alias fd="fdfind"
alias vvenv='/usr/bin/python3 -m venv .venv && source .venv/bin/activate'
alias o="xdg-open ."
alias c="code ."
alias diff="colordiff"
alias vim="nvim"

# =============================================================================
# Configuration & Dotfiles Editing
# =============================================================================
alias bedit="vim ~/.bashrc"
alias balias="vim ~/.bash_aliases"
alias sb="source ~/.bashrc"

# =============================================================================
# Network Commands
# =============================================================================
alias resnet="sudo systemctl restart NetworkManager && sudo systemctl status NetworkManager"

# =============================================================================
# SSH & Permissions
# =============================================================================
alias sa="ssh-add -t 8h ~/.ssh/id_rsa"


# =============================================================================
# Docker & Docker-Compose
# =============================================================================
# Docker Commands
alias di="docker images"
alias ds="docker stop"
alias dr="docker run"
alias drf="docker rm -f"
alias dp="docker ps"
alias dv="docker volume"
alias dpa="docker ps -a"
alias dei="docker exec -it"
alias dcl="docker container ls"
alias dvl="docker volume ls"

# Docker-Compose Commands
alias dc="docker compose"
alias dpp='docker ps --format "table {{.Names}}\t{{.ID}}\t{{.Status}}\t{{.Ports}}"'
alias dcp="docker compose ps"
alias dcu="docker compose up -d"
alias dcd="docker compose down"
alias dcs="docker compose stop"
alias dci="docker compose images"
alias dcc="docker compose config"
alias dcr="docker compose restart"
alias dcf="docker compose logs -f"

# Docker + LazyDocker
alias dld="docker compose up -d && lazydocker"
alias dbaf="docker compose -f docker-compose.dev.yml up -d && lazydocker"

# =============================================================================
# Git Shortcuts
# =============================================================================
alias gs="git status -s"
alias gss="git status"
alias ga="git add"
alias gp="git push"
alias gb="git branch"
alias gba="git branch -a"
alias gd="git diff"
alias glog="git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --stat"
alias glogg="git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --all --stat"
alias glg="git log --oneline --decorate --graph"
alias glgg="git log --oneline --decorate --graph --all"
alias gcm="git commit -m"

# TODO
# source : https://stackoverflow.com/questions/15661853/list-all-local-branches-without-a-remote
# list branches with remote but not local
# git for-each-ref  --format='%(refname:short) %(upstream)'  refs/heads \ | awk '$2 !~/^refs\/remotes/'

# =============================================================================
# Fasd (Quick Navigation)
# =============================================================================
alias a="fasd -a"        # Any
alias s="fasd -si"       # Show / search / select
alias d="fasd -d"        # Directory
alias f="fasd -f"        # File
alias sd="fasd -sid"     # Interactive directory selection
alias sf="fasd -sif"     # Interactive file selection
alias z="fasd_cd -d"     # cd, same as 'j' in autojump
alias zz="fasd_cd -d -i" # cd with interactive selection
alias v="f -e vim"       # Open files with vim

# =============================================================================
# SEB VPN & NordVPN
# =============================================================================
alias vpn='sudo /usr/sbin/openvpn --cd /home/bgi/.secrets/vpn-seb --config /home/bgi/.secrets/vpn-seb/openvpn_client.ovpn'

alias npf="nordvpn connect France"
alias npt="nordvpn connect Thailand"
alias npd="nordvpn disconnect"


# =============================================================================
# Vagrant
# =============================================================================
alias vu="vagrant up"
alias vs="vagrant ssh"
alias vus="vagrant up && vagrant ssh"
alias vr="vagrant run"
alias vh="vagrant halt"
alias vp="vprovision"
alias vss="vagrant status"
alias vgs="vagrant global-status"
alias vdf="vagrant destroy -f"
alias vre="vagrant reload"
alias wss="watch vagrant status"
alias vd="vagrant destroy"
alias vup="vagrant up && vagrant provision"

# =============================================================================
# Utils
# =============================================================================
# >/dev/null 2>&1 → hides all stdout and stderr output from docker run and xdg-open
# nohup → prevents the xdg-open process from being tied to your shell session.
# & disown → sends it to the background and removes it from your job list so it won’t print anything when it finishes.
alias maza='docker run -d --rm --name mazanoke -p 3474:80 ghcr.io/civilblur/mazanoke:latest >/dev/null 2>&1 && nohup xdg-open http://localhost:3474 >/dev/null 2>&1 & disown'
alias omni='docker run -d --rm --name omni-tools -p 3475:80 iib0011/omni-tools:latest >/dev/null 2>&1 && nohup xdg-open http://localhost:3475 >/dev/null 2>&1 & disown'
alias it='docker run -d --rm --name it-tools -p 3476:80 corentinth/it-tools:latest >/dev/null 2>&1 && nohup xdg-open http://localhost:3476 >/dev/null 2>&1 & disown'

# System Clock in Terminal
alias fclock='TZ="Europe/Paris" tty-clock -x -c -C 6 -f "%d/%m/%Y"'
alias vclock='TZ="Asia/Ho_Chi_Minh" tty-clock -x -c -C 6 -f "%d/%m/%Y"'

# Virtualenv
alias sy="source ~/.virtualenv/bin/activate"

# Clipboard Shortcuts
# TODO use xclipboard ?
alias xcopy="xclip -sel clip"
alias xpaste="xclip -out -sel clip"
alias cb="snap run clipboard"

alias gpi="gping 10.33.0.42"
alias gpp="gping 10.33.0.47"

alias glow='glow -p'


# =============================================================================
# Hugo - blog
# =============================================================================
alias h='hugo server --bind="192.168.1.46" --baseURL="http://192.168.1.46:1313/mon-periple/" --appendPort=false --disableFastRender'


# =============================================================================
# Bluetooth USB Driver Restart
# =============================================================================
# The 'blue' alias reloads the Bluetooth USB driver to fix connectivity issues.
# This can be useful if Bluetooth devices stop responding or fail to connect.
#
# Command Breakdown:
#   sudo modprobe -r btusb  -> Removes the Bluetooth USB driver module.
#   &&                       -> Ensures the next command runs only if the first succeeds.
#   sudo modprobe btusb      -> Reloads the Bluetooth USB driver module.
#
# Why Use This?
# - Fixes issues where Bluetooth stops working without restarting the system.
# - Helps when 'bluetoothctl' reports "No default controller available."
# - Useful if restarting the Bluetooth service does not resolve issues.
#
# Alternative Debugging Commands:
#   systemctl status bluetooth        -> Check Bluetooth service status.
#   sudo systemctl restart bluetooth  -> Restart the Bluetooth service.
#   lsmod | grep btusb                -> Verify if the Bluetooth USB module is loaded.
#
# Usage:
#   Run 'blue' in the terminal to restart the Bluetooth driver.
# =============================================================================
alias blue="sudo modprobe -r btusb && sudo modprobe btusb"
