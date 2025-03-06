const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');

// Configuration 
// Using the NSID for Bram Willemse's account
const FLICKR_USER_ID = '25787603@N08'; // Bram's Flickr NSID
// Use the atom format instead of RSS which is more reliable
const FLICKR_FEED_URL = `https://www.flickr.com/services/feeds/photos_public.gne?id=${FLICKR_USER_ID}`;
// Limit to 10 most recent photos by default
const PHOTO_LIMIT = 10;
const CONTENT_DIR = path.join(__dirname, '../content/photos');
const FORCE_UPDATE = process.argv.includes('--force');
const USE_SAMPLE = process.argv.includes('--sample');

// Path to sample data file (for testing)
const SAMPLE_FILE_PATH = path.join(__dirname, 'flickr-sample.xml');

// Configure axios with better headers
const api = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 BramWillemseWebsite/1.0 (https://bramwillemse.nl)',
    'Accept': 'application/rss+xml, text/xml',
    'Referer': 'https://bramwillemse.nl'
  },
  timeout: 10000
});

// Ensure photos content directory exists
if (!fs.existsSync(CONTENT_DIR)) {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  console.log(`Created directory: ${CONTENT_DIR}`);
}

// Create _index.md if it doesn't exist
const indexPath = path.join(CONTENT_DIR, '_index.md');
if (!fs.existsSync(indexPath)) {
  const indexContent = `---
title: "Photos"
description: "Photos I've taken and shared on Flickr."
url: /photos/
---
`;
  fs.writeFileSync(indexPath, indexContent);
  console.log(`Created index file: ${indexPath}`);
}

// Get existing photo slugs to avoid duplicates
function getExistingPhotoSlugs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  
  return fs.readdirSync(CONTENT_DIR)
    .filter(file => file !== '_index.md' && file.endsWith('.md'))
    .map(file => file.replace('.md', ''));
}

// Format date for Hugo frontmatter (YYYY-MM-DDThh:mm:ss+00:00)
function formatDate(date) {
  return date.toISOString();
}

// Generate a slug from the photo title
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Create a Hugo content file for a photo
function createPhotoContent(photo) {
  // Extract data from the photo (handling both RSS and Atom formats)
  let title, link, pubDate, description, imageUrl, author, categories;
  
  // Check if it's RSS format
  if (photo.title && photo.link && photo.pubDate) {
    title = photo.title[0];
    link = photo.link[0];
    pubDate = new Date(photo.pubDate[0]);
    description = photo.description ? photo.description[0] : '';
    
    // Extract image URL from description
    const imgMatch = description.match(/<img src="([^"]+)"[^>]*>/);
    imageUrl = imgMatch ? imgMatch[1] : '';
    
    // Find author name
    author = photo['dc:creator'] ? photo['dc:creator'][0] : 'Bram Willemse';
    
    // Extract tags
    categories = photo.category || [];
  } 
  // Check if it's Atom format
  else if (photo.title && photo.link && photo.published) {
    title = photo.title[0]._ || photo.title[0];
    
    // Find the link to the photo page
    const links = photo.link || [];
    const photoLink = links.find(l => l.$.rel === 'alternate');
    link = photoLink ? photoLink.$.href : '';
    
    pubDate = new Date(photo.published[0]);
    
    // Find content with the image
    const content = photo.content ? photo.content[0]._ : '';
    
    // Extract image URL from content
    const imgMatch = content ? content.match(/<img src="([^"]+)"[^>]*>/) : null;
    imageUrl = imgMatch ? imgMatch[1] : '';
    
    // Find author name
    author = photo.author && photo.author[0].name ? photo.author[0].name[0] : 'Bram Willemse';
    
    // Extract tags/categories
    categories = photo.category || [];
  } else {
    // If we can't identify the format, use default values
    title = 'Untitled Photo';
    link = '';
    pubDate = new Date();
    imageUrl = '';
    author = 'Bram Willemse';
    categories = [];
  }
  
  // Generate a slug from the title and date
  const datePrefix = pubDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const slug = `${datePrefix}-${slugify(title)}`;
  
  // Process tags based on the format
  let tags = [];
  
  if (categories && categories.length > 0) {
    // Handle both Atom and RSS formats for categories
    if (categories[0].$) {
      // RSS format
      tags = categories.map(cat => cat.$.term).filter(tag => tag !== 'bramwillemse');
    } else if (typeof categories[0] === 'string') {
      // Some Atom feeds have categories as strings
      tags = categories.filter(tag => tag !== 'bramwillemse');
    } else if (categories[0]._ || categories[0].term) {
      // Other Atom feeds have categories as objects
      tags = categories.map(cat => cat._ || cat.term || '').filter(tag => tag && tag !== 'bramwillemse');
    }
  }
  
  // Create frontmatter
  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${formatDate(pubDate)}
description: "Photo: ${title.replace(/"/g, '\\"')}"
author: ${author}
type: "photos"
tags: [${tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]
flickr:
  url: "${link}"
  image_url: "${imageUrl}"
---

{{< flickr-image url="${imageUrl}" title="${title.replace(/"/g, '\\"')}" >}}
`;

  // Write to file
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);
  fs.writeFileSync(filePath, frontmatter);
  
  return slug;
}

// Main function to fetch and process the feed
async function fetchAndProcessFeed() {
  try {
    let xmlData;
    
    if (USE_SAMPLE) {
      console.log('Using sample feed data for testing...');
      
      if (!fs.existsSync(SAMPLE_FILE_PATH)) {
        console.error(`Sample file not found at ${SAMPLE_FILE_PATH}`);
        
        // Create sample file with minimal structure for testing
        const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Flickr Test Feed</title>
    <link>https://www.flickr.com/photos/bramwillemse/</link>
    <description>Test feed for bramwillemse.nl</description>
    <item>
      <title>Test Photo 1</title>
      <link>https://www.flickr.com/photos/test/1234/</link>
      <description>&lt;p&gt;&lt;a href="https://www.flickr.com/people/test/"&gt;Test User&lt;/a&gt; posted a photo:&lt;/p&gt; &lt;p&gt;&lt;a href="https://www.flickr.com/photos/test/1234/" title="Test Photo 1"&gt;&lt;img src="https://picsum.photos/600/400" width="600" height="400" alt="Test Photo 1" /&gt;&lt;/a&gt;&lt;/p&gt;</description>
      <pubDate>Wed, 06 Mar 2025 12:00:00 GMT</pubDate>
      <dc:creator>bramwillemse</dc:creator>
      <category scheme="https://www.flickr.com/photos/tags/" term="test"/>
      <category scheme="https://www.flickr.com/photos/tags/" term="sample"/>
    </item>
    <item>
      <title>Test Photo 2</title>
      <link>https://www.flickr.com/photos/test/5678/</link>
      <description>&lt;p&gt;&lt;a href="https://www.flickr.com/people/test/"&gt;Test User&lt;/a&gt; posted a photo:&lt;/p&gt; &lt;p&gt;&lt;a href="https://www.flickr.com/photos/test/5678/" title="Test Photo 2"&gt;&lt;img src="https://picsum.photos/600/400?random=2" width="600" height="400" alt="Test Photo 2" /&gt;&lt;/a&gt;&lt;/p&gt;</description>
      <pubDate>Tue, 05 Mar 2025 12:00:00 GMT</pubDate>
      <dc:creator>bramwillemse</dc:creator>
      <category scheme="https://www.flickr.com/photos/tags/" term="test"/>
      <category scheme="https://www.flickr.com/photos/tags/" term="example"/>
    </item>
  </channel>
</rss>`;
        
        fs.writeFileSync(SAMPLE_FILE_PATH, sampleXml);
        console.log(`Created sample file at ${SAMPLE_FILE_PATH}`);
      }
      
      xmlData = fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
    } else {
      console.log('Fetching Flickr feed...');
      
      // Add retry logic
      let attempts = 0;
      const maxAttempts = 3;
      let response;
      
      while (attempts < maxAttempts) {
        try {
          console.log(`Attempt ${attempts + 1} of ${maxAttempts}...`);
          response = await api.get(FLICKR_FEED_URL);
          xmlData = response.data;
          break; // If successful, exit the retry loop
        } catch (err) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw err; // Rethrow if we've exhausted all attempts
          }
          
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempts) * 1000;
          console.log(`Request failed, retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);
    
    const existingSlugs = getExistingPhotoSlugs();
    console.log(`Found ${existingSlugs.length} existing photos`);
    
    // Check for different feed formats (RSS or Atom)
    let items = [];
    
    if (result.rss && result.rss.channel && result.rss.channel[0].item) {
      // Handle RSS format
      items = result.rss.channel[0].item;
    } else if (result.feed && result.feed.entry) {
      // Handle Atom format
      items = result.feed.entry;
    } else {
      console.log('No photos found in the feed. The user might not exist or have no public photos.');
      return;
    }
    
    console.log(`Found ${items.length} photos in the Flickr feed`);
    
    // Limit the number of photos to process
    const itemsToProcess = items.slice(0, PHOTO_LIMIT);
    console.log(`Processing ${itemsToProcess.length} most recent photos`);
    
    let newPhotos = 0;
    
    for (const item of itemsToProcess) {
      // Handle both RSS and Atom formats for checking existing items
      let itemTitle, itemDate, dateSlugPart;
      
      // RSS format
      if (item.title && item.pubDate) {
        itemTitle = item.title[0];
        itemDate = new Date(item.pubDate[0]);
      }
      // Atom format 
      else if (item.title && item.published) {
        itemTitle = item.title[0]._ || item.title[0];
        itemDate = new Date(item.published[0]);
      }
      // Fallback
      else {
        itemTitle = "Untitled";
        itemDate = new Date();
      }
      
      dateSlugPart = itemDate.toISOString().split('T')[0];
      const potentialSlugs = existingSlugs.filter(slug => 
        slug.startsWith(dateSlugPart) && slug.includes(slugify(itemTitle))
      );
      
      // Skip if we already have this photo (unless forced update)
      if (potentialSlugs.length > 0 && !FORCE_UPDATE) {
        continue;
      }
      
      const slug = createPhotoContent(item);
      console.log(`Added new photo: ${slug}`);
      newPhotos++;
    }
    
    console.log(`Added ${newPhotos} new photos`);
    
  } catch (error) {
    console.error('Error fetching or processing Flickr feed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
fetchAndProcessFeed();