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


# =============================================================================
# Terminal Commands
# =============================================================================
alias rm="rm -i"
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
alias dc='docker-compose'
alias dcp='docker-compose ps'
alias dcu='docker-compose up -d'
alias dcd='docker-compose down'
alias dcs='docker-compose stop'
alias dci='docker-compose images'
alias dcc="docker-compose config"
alias dcr='docker-compose restart'
alias dcf='docker-compose logs -f'


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
alias gd="git diff"
alias glog="git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --all --stat"
alias glg="git log --oneline --decorate --graph --all"
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
alias tfi='terraform init'
alias tfa='terraform apply'
alias tfd='terraform destroy'


# =============================================================================
# Utils
# =============================================================================
# SSH permissions
alias perm='printf "700 ~/.ssh \n600 ~/.ssh/authorized_keys \n664 ~/.ssh/config \n600 ~/.ssh/id_rsa \n644 ~/.ssh/id_rsa.pub \n600 ~/.ssh/known_hosts\n"'

# Show only IP addresses
# TODO add interface name
function ipinet(){
ip -4 a | grep inet | awk '{print $2}'
}
alias ipinet=ipinet
