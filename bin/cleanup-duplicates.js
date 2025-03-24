/**
 * Script to clean up duplicate photo files
 * Removes "untitled photo" versions when there's a location-based version of the same photo
 */

const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, '../content/photos');

// Function to extract photo ID from frontmatter
function extractPhotoId(content) {
  const match = content.match(/photo_id:\s*"(\d+)"/i);
  return match ? match[1] : null;
}

// Function to extract title from frontmatter
function extractTitle(content) {
  const match = content.match(/title:\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

// Function to check if a file has "Untitled Photo" as title
function isUntitledPhoto(content) {
  const title = extractTitle(content);
  return title === 'Untitled Photo';
}

// Function to find and remove duplicate photo files
function cleanupDuplicates() {
  console.log('Starting duplicate cleanup...');
  
  // Read all photo files
  const files = fs.readdirSync(PHOTOS_DIR)
    .filter(file => file.endsWith('.md') && file !== '_index.md');
  
  console.log(`Found ${files.length} photo files`);
  
  // Group files by photo ID
  const photoGroups = {};
  
  files.forEach(filename => {
    const filePath = path.join(PHOTOS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const photoId = extractPhotoId(content);
    
    if (photoId) {
      if (!photoGroups[photoId]) {
        photoGroups[photoId] = [];
      }
      
      photoGroups[photoId].push({
        filename,
        path: filePath,
        content,
        isUntitled: isUntitledPhoto(content)
      });
    }
  });
  
  // Find groups with duplicates
  let removedCount = 0;
  
  Object.keys(photoGroups).forEach(photoId => {
    const group = photoGroups[photoId];
    
    if (group.length > 1) {
      // Check if we have both untitled and non-untitled versions
      const untitledFiles = group.filter(file => file.isUntitled);
      const locationFiles = group.filter(file => !file.isUntitled);
      
      if (untitledFiles.length > 0 && locationFiles.length > 0) {
        console.log(`Found duplicate for photo ID ${photoId}:`);
        
        // Delete the untitled versions
        untitledFiles.forEach(file => {
          console.log(`  Removing: ${file.filename}`);
          fs.unlinkSync(file.path);
          removedCount++;
        });
      }
    }
  });
  
  console.log(`Cleanup complete. Removed ${removedCount} duplicate files.`);
}

// Run the cleanup function
cleanupDuplicates();