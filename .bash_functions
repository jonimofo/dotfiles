# =============================================================================
# Help / Utils
# =============================================================================
# tmux cheatsheet
th() {
    cat <<EOF
    ┌──────────────────────────────┬───────────────────────────────────────┐
    │ ======================== SESSIONS ================================== │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ Start tmux                   │ tmux                                  │
    │ Start named session          │ tmux new -s <name>                    │
    │ List sessions                │ tmux ls                               │
    │ Attach to session            │ tmux attach -t <name>                 │
    │ Reattach last session        │ tmux attach-session                   │
    │ Detach from session          │ prefix + d                            │
    │ Save session (resurrect)     │ prefix + Ctrl + s                     │
    │ Restore session (resurrect)  │ prefix + Ctrl + r                     │
    │ Kill a session               │ tmux kill-session -t <name>           │
    │ Kill all sessions            │ tmux kill-server                      │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ ========================== WINDOWS ================================= │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ Create new window            │ prefix + c                            │
    │ Rename window                │ prefix + ,                            │
    │ Switch to next window        │ prefix + p / Ctrl + p                 │
    │ Switch to previous window    │ prefix + o / Ctrl + o                 │
    │ Close current window         │ exit or Ctrl + d                      │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ ======================= COPY & PASTE =============================== │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ Enter copy mode              │ prefix + m                            │
    │ Start selection              │ v                                     │
    │ Copy selection               │ y or Enter                            │
    │ Paste from tmux buffer       │ prefix + ]                            │
    │ Paste from system clipboard  │ Alt + V                               │
    │ Mouse selection              │ Shift + drag OR native drag           │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ ========================== PANES =================================== │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ Split pane (horizontal)      │ prefix + i                            │
    │ Split pane (vertical)        │ prefix + u                            │
    │ Move between panes           │ prefix + h / j / k / l                │
    │ Resize pane                  │ prefix + H / J / K / L                │
    │ Close pane                   │ exit or Ctrl + d                      │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ ========================== OTHER =================================== │
    ├──────────────────────────────┼───────────────────────────────────────┤
    │ Reload tmux config           │ prefix + r                            │
    └──────────────────────────────┴───────────────────────────────────────┘
EOF
}

# ssh permissions
perm() {
    cat <<EOF
┌────────┬──────────────────────────────┐
│ Mode   │ File                         │
├────────┼──────────────────────────────┤
│ 700    │ ~/.ssh                       │
│ 600    │ ~/.ssh/authorized_keys       │
│ 664    │ ~/.ssh/config                │
│ 600    │ ~/.ssh/id_rsa                │
│ 644    │ ~/.ssh/id_rsa.pub            │
│ 600    │ ~/.ssh/known_hosts           │
└────────┴──────────────────────────────┘
EOF
}

# chmod cheatsheet
chmod_show() {
  # helper: turn one octal digit (0–7) into rwx
  _bit_to_rwx() {
    local d=$1
    (( d & 4 )) && printf 'r' || printf '-'
    (( d & 2 )) && printf 'w' || printf '-'
    (( d & 1 )) && printf 'x' || printf '-'
  }

  # convert full 3-digit mode to symbolics
  _mode_to_sym() {
    local m=$1
    _bit_to_rwx "${m:0:1}"
    _bit_to_rwx "${m:1:1}"
    _bit_to_rwx "${m:2:1}"
  }

  if [ $# -eq 0 ]; then
    printf "%-5s %-10s %s\n" "Mode" "Symbolic" "Description"
    for mode in 600 644 666 700 755 775 777; do
      sym=$(_mode_to_sym "$mode")
      case "$mode" in
        600) desc="rw------- (owner rw only)";;
        644) desc="rw-r--r-- (owner rw, group/other r)";;
        666) desc="rw-rw-rw- (all read/write)";;
        700) desc="rwx------ (owner rwx only)";;
        755) desc="rwxr-xr-x (owner rwx, grp/oth r+x)";;
        775) desc="rwxrwxr-x (owner/grp rwx, oth r+x)";;
        777) desc="rwxrwxrwx (everyone rwx)";;
        *)   desc="";;
      esac
      printf "%-5s %-10s %s\n" "$mode" "$sym" "$desc"
    done
  else
    for mode in "$@"; do
      if [[ ! $mode =~ ^[0-7]{3}$ ]]; then
        printf "Invalid mode: %s (must be three octal digits)\n" "$mode" >&2
      else
        sym=$(_mode_to_sym "$mode")
        printf "%s → %s\n" "$mode" "$sym"
      fi
    done
  fi
}


# =============================================================================
# Prompt
# =============================================================================
# Add git branch to prompt
    # Uses git symbolic-ref --short HEAD, which is faster than git branch
    # Falls back to git rev-parse --short HEAD for detached HEAD state
parse_git_branch() {
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    [[ -n $branch ]] && echo " ($branch)"
}

# =============================================================================
# Network
# =============================================================================
ipinet() {
    ip -4 addr show | awk '/inet / {print $2 "\t" $NF}'
}

# Function to check dependencies and fetch public IP information
get_public_ip_info() {
    # Ensure required commands are available
    for cmd in curl jq; do
        if ! command -v "$cmd" &> /dev/null; then
            echo "Error: '$cmd' is required but not installed. Please install it."
            return 1
        fi
    done

    # Fetch IP information from ipinfo.io
    local response
    response=$(curl --silent --fail "https://ipinfo.io")

    # Check if curl request was successful
    if [[ -z "$response" ]]; then
        echo "Error: Failed to fetch IP information."
        return 1
    fi

    # Parse and format output using jq
    jq --raw-output '"IP = " + .ip + "\nCity = " + .city + "\nRegion = " + .region + "\nCountry = " + .country + "\nTimezone = " + .timezone' <<< "$response"
}


# =============================================================================
# Function to retry a given command until it succeeds or max retries are reached
# =============================================================================
retry_command() {
    local command=""
    local max_retries=0  # Default: infinite retries
    local delay=5        # Delay between retries (seconds)
    local count=0

    # Usage message
    usage() {
        echo "Usage: retry_command -c <command> [-r <max_retries>]"
        echo "  -c <command>     Command to execute (required)"
        echo "  -r <max_retries> Maximum number of retries (default: infinite)"
        echo "Example: retry_command -c 'xfreerdp /v:server /u:user' -r 5"
    }

    # Parse options
    while getopts ":c:r:" opt; do
        case "$opt" in
            c) command="$OPTARG" ;;
            r) max_retries="$OPTARG" ;;
            :) echo "Error: Option -$OPTARG requires an argument." >&2; usage; return 1 ;;
            \?) echo "Error: Invalid option -$OPTARG" >&2; usage; return 1 ;;
        esac
    done

    # Validate command argument
    if [[ -z "$command" ]]; then
        echo "Error: Command (-c) is required." >&2
        usage
        return 1
    fi

    # Retry loop
    while true; do
        bash -i -c "$command" && return 0  # Run in an interactive shell to expand aliases

        ((count++))
        echo "Command '$command' failed, retrying in $delay seconds... (Attempt $count/${max_retries:-∞})"

        if [[ "$max_retries" -gt 0 && "$count" -ge "$max_retries" ]]; then
            echo "Max retries ($max_retries) reached. Exiting."
            return 1
        fi

        sleep "$delay"
    done
}


# =============================================================================
# yt-dlp
# =============================================================================
download_video() {
    # Default destination directory
    local dest_dir="$HOME/Videos/Youtube"

    # Check if yt-dlp is installed
    if ! command -v yt-dlp &>/dev/null; then
        echo "Error: yt-dlp is not installed. Please install it first." >&2
        return 1
    fi

    # Validate input arguments
    if [[ $# -lt 1 ]]; then
        echo "Usage: download_video <url> [destination_directory]"
        echo "Example: download_video 'https://www.youtube.com/watch?v=example' '~/Downloads'"
        return 1
    fi

    # Extract parameters
    local url="$1"
    if [[ $# -ge 2 ]]; then
        dest_dir="$2"
    fi

    # Ensure the destination directory exists
    mkdir -p "$dest_dir"

    # Run yt-dlp with the specified options:
    yt-dlp \
        -f bestvideo*+bestaudio/best \        # Selects the best available video + best audio combination, or the best overall format
        -R "infinite" \                       # Retries infinitely on network failures
        --ignore-errors \                     # Continues downloading other videos even if an error occurs
        --restrict-filenames \                # Ensures filenames use only ASCII characters (avoids special characters)
        -P "$dest_dir" \                      # Sets the download directory to the specified destination
        -o "%(channel)s-%(title)s.%(ext)s" \  # Formats filenames as "<channel>-<video_title>.<extension>"
        "$url"                                # The URL of the video to download

}

# Example usage:
# download_video "https://www.youtube.com/watch?v=example"
# download_video "https://www.youtube.com/watch?v=example" "~/Downloads"


alias dlgg='yt-dlp -f "bestvideo+bestaudio"'

