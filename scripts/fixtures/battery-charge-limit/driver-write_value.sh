# shellcheck shell=sh
write_value() {
    # Test copy only: models the dell-laptop driver on the fake tree. Logs each write as
    # "file requested stored".
    if [ -e "$1.readonly" ]; then
        printf '%s %s refused\n' "${1##*/}" "$2" >> "$BATTERY_DIR/.writes"
        return 1
    fi
    case $1 in
        */charge_types)
            line=''
            for mode in Trickle Fast Standard Adaptive Custom; do
                if [ "$mode" = "$2" ]; then
                    line="$line [$mode]"
                else
                    line="$line $mode"
                fi
            done
            printf '%s\n' "${line# }" > "$1"
            printf '%s %s %s\n' "${1##*/}" "$2" "$2" >> "$BATTERY_DIR/.writes"
            ;;
        */charge_control_start_threshold)
            value=$2
            other=$(cat "$BATTERY_DIR/charge_control_end_threshold")
            if [ $((other - value)) -lt "$MIN_GAP" ]; then
                value=$((other - MIN_GAP))
            fi
            printf '%s\n' "$value" > "$1"
            printf '%s %s %s\n' "${1##*/}" "$2" "$value" >> "$BATTERY_DIR/.writes"
            ;;
        */charge_control_end_threshold)
            value=$2
            other=$(cat "$BATTERY_DIR/charge_control_start_threshold")
            if [ -e "$BATTERY_DIR/.stuck_end" ]; then
                value=$(cat "$BATTERY_DIR/.stuck_end")
            elif [ $((value - other)) -lt "$MIN_GAP" ]; then
                value=$((other + MIN_GAP))
            fi
            printf '%s\n' "$value" > "$1"
            printf '%s %s %s\n' "${1##*/}" "$2" "$value" >> "$BATTERY_DIR/.writes"
            ;;
    esac
}
