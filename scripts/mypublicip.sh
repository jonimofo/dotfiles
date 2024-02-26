#!/bin/bash

# Check if curl is installed
if ! command -v curl &> /dev/null; then
    echo "curl is required. Please install it to use this command."
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq is required. Please install it to use this command."
    exit 1
fi

# If both are installed, proceed with the command
curl --silent ipinfo.io | jq --raw-output "\"IP = \" + .ip + \"\nCity = \" + .city + \"\nRegion = \" + .region + \"\nCountry = \" + .country + \"\nTimezone = \" + .timezone"

