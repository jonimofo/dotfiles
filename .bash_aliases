# =============================================================================
# Dossiers
# =============================================================================
alias ..="cd .."
alias ...="cd ../.."
alias r="cd ~/Repos"
alias doc="cd ~/Documents"
alias donn="cd ~/Donnees"
alias dow="cd ~/Downloads"
alias des="cd ~/Desktop"


# =============================================================================
# Dotfiles edition
# =============================================================================
alias bedit="vim ~/.bashrc"
alias balias="vim ~/.bash_aliases"
alias sb="source ~/.bashrc"


# =============================================================================
# Terminal Commands
# =============================================================================
alias rm="rm -i"
alias nvim="~/.local/bin/nvim"
alias vim="nvim"
alias ls="exa"
alias ll="exa -l"
alias l="exa -la"
alias lt="exa -lT"
alias cat="batcat -p"
alias fd="fdfind"
alias vvenv='/usr/bin/python3 -m venv .venv && source .venv/bin/activate'
alias o="xdg-open ."
alias c="code ."
alias sa="ssh-add -t 8h ~/.ssh/id_rsa"
alias diff="colordiff"

# Network
alias resnet="sudo systemctl restart NetworkManager && sudo systemctl status NetworkManager"
alias myip="watch ~/Repos/dotfiles/scripts/mypublicip.sh"

#TODO dynamic IP ? if starting with 192 ?
# HUGO
alias h='hugo server --bind="192.168.1.18" --baseURL="http://192.168.1.18:1313/mon-periple/" --appendPort=false --disableFastRender'

#TODO
alias xcopy="xclip -sel clip"
alias xpaste="xclip -out -sel clip"
alias cb='snap run clipboard'

# -x: show box
# -c: Center the clock in the terminal window
# -C 6: Set the clock color to cyan (color code 6)
# -f "%d/%m/%Y": Set the date format
alias fclock='TZ='Europe/Paris' tty-clock -x -c -C 6 -f "%d/%m/%Y"'

# =============================================================================
# Docker & Docker-Compose
# =============================================================================
alias di='docker images'
alias ds='docker stop'
alias dr="docker run"
alias dp='docker ps'
alias dv='docker volume'
alias dpa='docker ps -a'
alias dei='docker exec -it'
alias dcl='docker container ls'
alias dvl="docker volume ls"

# Docker-Compose
alias dc='docker compose'
alias dcp='docker compose ps'
alias dcu='docker compose up -d'
alias dcd='docker compose down'
alias dcs='docker compose stop'
alias dci='docker compose images'
alias dcc="docker compose config"
alias dcr='docker compose restart'
alias dcf='docker compose logs -f'

# Docker Compose & Lazy Docker
alias dld='docker compose up -d && lazydocker'

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
# Git
# =============================================================================
# TODO autocomplet on aliases
alias gs="git status -s"
alias gss="git status"
alias ga="git add"
alias gp="git push"
alias gb='git branch'
alias gba='git branch -a'
alias gd="git diff"
alias glog="git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --stat"
alias glogg="git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --all --stat"
alias glg="git log --oneline --decorate --graph"
alias glgg="git log --oneline --decorate --graph --all"
alias gcm="git commit -m"


# =============================================================================
# Fasd
# =============================================================================
alias a='fasd -a'        # any
alias s='fasd -si'       # show / search / select
alias d='fasd -d'        # directory
alias f='fasd -f'        # file
alias sd='fasd -sid'     # interactive directory selection
alias sf='fasd -sif'     # interactive file selection
alias z='fasd_cd -d'     # cd, same functionality as j in autojump
alias zz='fasd_cd -d -i' # cd with interactive selection
alias v='f -e vim' # quick opening files with vim


# =============================================================================
# Terraform
# =============================================================================
# alias tfi='terraform init'
# alias tfa='terraform apply'
# alias tfd='terraform destroy'


# =============================================================================
# Tidy-viewer
# =============================================================================
alias tv="tidy-viewer"


# =============================================================================
# Utils
# =============================================================================
# SSH permissions
alias perm='printf "700 ~/.ssh \n600 ~/.ssh/authorized_keys \n664 ~/.ssh/config \n600 ~/.ssh/id_rsa \n644 ~/.ssh/id_rsa.pub \n600 ~/.ssh/known_hosts\n"'

# ydl
alias dlvid='yt-dlp -f bestvideo*+bestaudio/best -R "infinite" --ignore-errors --restrict-filenames -P ~/Videos/Youtube/ -o "%(channel)s-%(title)s.%(ext)s"'
alias dlgg='yt-dlp -f "bestvideo+bestaudio"'


# Show only IP addresses
# TODO add interface name
function ipinet(){
ip -4 a | grep inet | awk '{print $2}'
}
alias ipinet=ipinet
