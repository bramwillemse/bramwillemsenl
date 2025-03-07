const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, 'content/photos');

// Extract ID from Flickr URLs in content
function extractPhotoId(content) {
  if (!content) return null;

  // Look for Flickr photo ID in frontmatter
  const idMatch = content.match(/photo_id:\s*"(\d+)"/i);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return null;
}

// Read file content to get Flickr ID
function getFlickrId(filename) {
  try {
    const filePath = path.join(PHOTOS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return extractPhotoId(content);
  } catch (error) {
    console.error(`Error reading file ${filename}:`, error.message);
    return null;
  }
}

// Get all photo markdown files
const files = fs.readdirSync(PHOTOS_DIR)
  .filter(file => file.endsWith('.md') && file !== '_index.md');

// Group by suffix (everything after the date)
const groups = {};

// Also group by Flickr ID if available
const flickrIdGroups = {};

files.forEach(file => {
  // Extract the date and suffix parts
  const parts = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (parts) {
    const [_, date, suffix] = parts;
    
    // Group by suffix
    if (!groups[suffix]) {
      groups[suffix] = [];
    }
    groups[suffix].push({
      filename: file,
      date: date
    });
    
    // Also group by Flickr ID if available
    const flickrId = getFlickrId(file);
    if (flickrId) {
      if (!flickrIdGroups[flickrId]) {
        flickrIdGroups[flickrId] = [];
      }
      flickrIdGroups[flickrId].push({
        filename: file,
        date: date
      });
    }
  }
});

// Find duplicates and keep the earliest date (which is the date taken)
let removedCount = 0;

// First handle duplicates by Flickr ID (most reliable method)
console.log("\nDeduplicating by Flickr ID...");
for (const flickrId in flickrIdGroups) {
  if (flickrIdGroups[flickrId].length > 1) {
    console.log(`Found duplicate Flickr ID: ${flickrId}`);
    
    // Sort by date (ascending)
    flickrIdGroups[flickrId].sort((a, b) => a.date.localeCompare(b.date));
    
    // Keep the first one (earliest date - which is the date taken)
    const toKeep = flickrIdGroups[flickrId][0];
    console.log(`  Keeping: ${toKeep.filename}`);
    
    // Remove the others
    for (let i = 1; i < flickrIdGroups[flickrId].length; i++) {
      const toRemove = flickrIdGroups[flickrId][i];
      console.log(`  Removing: ${toRemove.filename}`);
      fs.unlinkSync(path.join(PHOTOS_DIR, toRemove.filename));
      removedCount++;
    }
  }
}

// Then handle duplicates by suffix (fallback method)
console.log("\nDeduplicating by filename suffix...");
for (const suffix in groups) {
  if (groups[suffix].length > 1) {
    console.log(`Found duplicate: ${suffix}`);
    
    // Sort by date (ascending)
    groups[suffix].sort((a, b) => a.date.localeCompare(b.date));
    
    // Keep the first one (earliest date - which is the date taken)
    const toKeep = groups[suffix][0];
    
    // Check if file still exists (it might have been removed in the Flickr ID pass)
    if (fs.existsSync(path.join(PHOTOS_DIR, toKeep.filename))) {
      console.log(`  Keeping: ${toKeep.filename}`);
      
      // Remove the others
      for (let i = 1; i < groups[suffix].length; i++) {
        const toRemove = groups[suffix][i];
        
        // Only remove if file still exists
        const removeFilePath = path.join(PHOTOS_DIR, toRemove.filename);
        if (fs.existsSync(removeFilePath)) {
          console.log(`  Removing: ${toRemove.filename}`);
          fs.unlinkSync(removeFilePath);
          removedCount++;
        }
      }
    }
  }
}

console.log(`\nRemoved ${removedCount} duplicate files.`);
