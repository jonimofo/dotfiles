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
# xfreerdp
# =============================================================================
function retry_xconnection() {
    if [[ $# -lt 1 ]]; then
        printf "Usage: retry_xconnection <command> [max_retries]\n"
        printf "Example: retry_xconnection \"xinteg\" 10\n"
        return 1
    fi

    local command="$1"             # Command to attempt connection
    local max_retries=${2:-150}    # Default max retries = 150
    local seconds_before_retry=5
    local count=0

    # Validate that max_retries is a positive integer
    if ! [[ "$max_retries" =~ ^[0-9]+$ ]]; then
        printf "Error: max_retries must be a positive integer.\n"
        return 1
    fi

    while (( count < max_retries )); do
        if command $command; then  # Safely run the command without eval
            return 0
        fi
        printf "Command '%s' failed, retrying in %d seconds... (Attempt %d/%d)\n" \
            "$command" "$seconds_before_retry" "$((count + 1))" "$max_retries"
        sleep "$seconds_before_retry"
        ((count++))
    done

    printf "Command '%s' failed after %d attempts. Exiting.\n" "$command" "$max_retries"
    return 1  # Indicate failure
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

# =============================================================================
# Hugo Development Server
# =============================================================================
alias h='hugo server --bind="192.168.1.18" --baseURL="http://192.168.1.18:1313/mon-periple/" --appendPort=false --disableFastRender'

