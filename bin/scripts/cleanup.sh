#\!/bin/bash

cd "$(dirname "$0")/../.."
PHOTOS_DIR="content/photos"

# Find all unique suffixes
find "$PHOTOS_DIR" -type f -name "*.md" -not -name "_index.md" | 
  sed -E 's|.*/[0-9]{4}-[0-9]{2}-[0-9]{2}-(.+)$|\1|' | 
  sort | uniq > /tmp/suffixes.txt

# For each suffix, keep the version with the earliest date
while read suffix; do
  files=$(find "$PHOTOS_DIR" -type f -name "*-$suffix")
  
  # Count files
  count=$(echo "$files" | wc -l | xargs)
  
  if [ "$count" -gt 1 ]; then
    echo "Found duplicate: $suffix ($count files)"
    
    # Get the earliest dated file
    earliest=$(echo "$files" | sort | head -1)
    echo "  Keeping: $(basename "$earliest")"
    
    # Remove the rest
    for file in $files; do
      if [ "$file" \!= "$earliest" ]; then
        echo "  Removing: $(basename "$file")"
        rm "$file"
      fi
    done
  fi
done < /tmp/suffixes.txt

echo "Cleanup completed"
