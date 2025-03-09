#!/bin/bash

# Check if assets/images/ exists
if [ ! -d "assets/images" ]; then
  echo "Creating assets/images directory"
  mkdir -p assets/images
fi

# Check if the logo file exists and is a proper image
if [ -e "assets/images/bram-willemse.jpg" ]; then
  file_type=$(file -b --mime-type assets/images/bram-willemse.jpg)
  if [[ $file_type != "image/jpeg" ]]; then
    echo "Logo file exists but is not a proper JPEG (detected: $file_type). Downloading logo image..."
    curl -s -L https://raw.githubusercontent.com/bramwillemse/bramwillemsenl/main/assets/images/bram-willemse.jpg -o assets/images/bram-willemse.jpg
  else
    echo "Logo file exists and is a proper JPEG"
  fi
else
  echo "Logo file does not exist. Downloading logo image..."
  curl -s -L https://raw.githubusercontent.com/bramwillemse/bramwillemsenl/main/assets/images/bram-willemse.jpg -o assets/images/bram-willemse.jpg
fi

# Ensure the file was downloaded successfully
if [ -e "assets/images/bram-willemse.jpg" ]; then
  file_type=$(file -b --mime-type assets/images/bram-willemse.jpg)
  if [[ $file_type == "image/jpeg" ]]; then
    echo "Logo image verified as JPEG"
  else
    echo "WARNING: Logo file does not appear to be a proper JPEG (detected: $file_type)"
  fi
else
  echo "ERROR: Failed to download logo image"
fi