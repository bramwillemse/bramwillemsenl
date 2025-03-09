const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const https = require('https');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
require('dotenv').config(); // Load environment variables from .env file

// Configuration
// Using the NSID for Bram Willemse's account
const FLICKR_USER_ID = process.env.FLICKR_USER_ID;
const FLICKR_API_KEY = process.env.FLICKR_API_KEY;
const FLICKR_API_SECRET = process.env.FLICKR_API_SECRET;
// Use the atom format instead of RSS which is more reliable
const FLICKR_FEED_URL = `https://www.flickr.com/services/feeds/photos_public.gne?id=${FLICKR_USER_ID}`;
// Limit to 10 most recent photos by default
const PHOTO_LIMIT = 10;
const CONTENT_DIR = path.join(__dirname, '../content/photos');
const ASSETS_DIR = path.join(__dirname, '../assets/images/photos');
const FORCE_UPDATE = process.argv.includes('--force');
const USE_SAMPLE = process.argv.includes('--sample');
const USE_SAMPLE_IMAGES = process.argv.includes('--sample-images');

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

// Ensure photos assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log(`Created assets directory: ${ASSETS_DIR}`);
}

// Function to download an image from Flickr with retry logic
async function downloadImage(imageUrl, photoId) {
  // Get the highest resolution version (_b.jpg or _o.jpg)
  const highResUrl = imageUrl.replace(/_m\.jpg$/, '_b.jpg');

  // Extract filename from Flickr URL
  const filename = `flickr-${photoId}.jpg`;
  const outputPath = path.join(ASSETS_DIR, filename);

  // Check if file already exists
  if (fs.existsSync(outputPath) && !FORCE_UPDATE) {
    console.log(`Image already downloaded: ${filename}`);
    return { success: true, path: `images/photos/${filename}` };
  }

  // For sample mode, use placeholder images instead of actual downloads
  if (USE_SAMPLE_IMAGES) {
    console.log(`Using sample image for photo ID: ${photoId}`);

    try {
      // Use Flickr URL for sample
      console.log(`Using Flickr URL for sample instead of local image`);

      // Return the Flickr URL - do not mark as sample to use the normal Flickr image
      return { success: true, path: highResUrl, isSample: false };
    } catch (error) {
      console.error(`Error setting up sample image: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Add retry logic for downloading
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      console.log(`Downloading image from ${highResUrl} (attempt ${attempts + 1}/${maxAttempts})`);

      // Add delay between retries
      if (attempts > 0) {
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Download the image directly with arraybuffer response type
      const response = await axios({
        url: highResUrl,
        method: 'GET',
        responseType: 'arraybuffer', // Important: use arraybuffer for binary data
        headers: {
          'User-Agent': 'Mozilla/5.0 BramWillemseWebsite/1.0 (https://bramwillemse.nl)',
          'Referer': 'https://bramwillemse.nl'
        },
        timeout: 15000
      });

      // Check content type to ensure it's an image
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`Downloaded content is not an image: ${contentType}`);
      }

      // Write the binary data directly to file
      fs.writeFileSync(outputPath, Buffer.from(response.data));

      console.log(`Saved image to: ${outputPath}`);
      return { success: true, path: `images/photos/${filename}` };
    } catch (error) {
      console.error(`Error downloading image (attempt ${attempts + 1}/${maxAttempts}): ${error.message}`);
      attempts++;

      if (attempts >= maxAttempts) {
        return { success: false, error: error.message };
      }
    }
  }
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

// Get existing Flickr photo IDs to avoid duplicates
function getExistingFlickrIds() {
  if (!fs.existsSync(CONTENT_DIR)) return {};

  const fileIds = {};
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(file => file !== '_index.md' && file.endsWith('.md'));
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
      // Extract Flickr photo ID from content
      const idMatch = content.match(/photo_id:\s*"(\d+)"/i);
      if (idMatch && idMatch[1]) {
        fileIds[idMatch[1]] = file;
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error.message);
    }
  }
  
  return fileIds;
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
async function createPhotoContent(photo) {
  // Extract data from the photo (handling both RSS and Atom formats)
  let title, link, pubDate, takenDate, description, imageUrl, author, categories, photoId;

  // Check if it's RSS format
  if (photo.title && photo.link && photo.pubDate) {
    title = photo.title[0];
    link = photo.link[0];
    pubDate = new Date(photo.pubDate[0]);
    description = photo.description ? photo.description[0] : '';

    // Extract photo ID from the link
    const idMatch = link.match(/\/photos\/[^\/]+\/(\d+)/);
    photoId = idMatch ? idMatch[1] : null;

    // Extract image URL from description
    const imgMatch = description.match(/<img src="([^"]+)"[^>]*>/);
    imageUrl = imgMatch ? imgMatch[1] : '';

    // Find author name
    author = photo['dc:creator'] ? photo['dc:creator'][0] : 'Bram Willemse';

    // Extract tags
    categories = photo.category || [];

    // Try to extract date taken from description or other fields
    // If not available, use publication date
    takenDate = pubDate;

    // Look for dateTaken in description (sometimes embedded in HTML)
    if (description) {
      const dateMatch = description.match(/taken on ([^<]+)/i);
      if (dateMatch && dateMatch[1]) {
        try {
          takenDate = new Date(dateMatch[1]);
        } catch (e) {
          // If parsing fails, keep the pubDate
          console.log(`Failed to parse taken date: ${dateMatch[1]}, using publication date instead`);
        }
      }
    }
  }
  // Check if it's Atom format
  else if (photo.title && photo.link && photo.published) {
    title = photo.title[0]._ || photo.title[0];

    // Find the link to the photo page
    const links = photo.link || [];
    const photoLink = links.find(l => l.$.rel === 'alternate');
    link = photoLink ? photoLink.$.href : '';

    // Extract photo ID from the link
    const idMatch = link.match(/\/photos\/[^\/]+\/(\d+)/);
    photoId = idMatch ? idMatch[1] : null;

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

    // Try to extract date taken from the entry
    takenDate = pubDate; // Default to pubDate

    // Look for dateTaken in content (sometimes embedded in HTML)
    if (content) {
      const dateMatch = content.match(/taken on ([^<]+)/i);
      if (dateMatch && dateMatch[1]) {
        try {
          takenDate = new Date(dateMatch[1]);
        } catch (e) {
          // If parsing fails, keep the pubDate
          console.log(`Failed to parse taken date: ${dateMatch[1]}, using publication date instead`);
        }
      }
    }
  } else {
    // If we can't identify the format, use default values
    title = 'Untitled Photo';
    link = '';
    pubDate = new Date();
    takenDate = pubDate;
    imageUrl = '';
    photoId = null;
    author = 'Bram Willemse';
    categories = [];
  }

  // Download the image to the assets directory if we have a photo ID
  let localImagePath = '';
  let downloadResult = null;
  if (photoId && imageUrl) {
    downloadResult = await downloadImage(imageUrl, photoId);
    if (downloadResult.success) {
      localImagePath = downloadResult.path;
    } else {
      console.warn(`Warning: Couldn't download image for ${title}, using Flickr URL instead`);
      localImagePath = imageUrl;
    }
  } else {
    localImagePath = imageUrl;
  }

  // Generate a slug from the title, taken date and photo ID to ensure uniqueness
  const datePrefix = takenDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const uniqueSuffix = photoId ? `-${photoId.slice(-4)}` : '';
  const slug = `${datePrefix}-${slugify(title)}${uniqueSuffix}`;

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

  // Determine what type of image we're using
  const isLocalImage = localImagePath.startsWith('images/');
  const isSampleImage = downloadResult && downloadResult.isSample;

  // Create a higher resolution URL by changing _m.jpg to _b.jpg for Flickr URLs
  const highResImageUrl = imageUrl.replace(/_m\.jpg$/, '_b.jpg');

  // Create frontmatter
  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${formatDate(takenDate)}
description: "Photo: ${title.replace(/"/g, '\\"')}"
author: ${author}
type: "photos"
tags: [${tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]
flickr:
  url: "${link}"
  photo_id: "${photoId || ''}"
  image_url: "${highResImageUrl}"
  date_taken: "${formatDate(takenDate)}"
  date_published: "${formatDate(pubDate)}"
featured_image:
  src: "${isLocalImage ? localImagePath : highResImageUrl}"
---

${isLocalImage
  ? `{{< figure src="/${localImagePath}" title="${title.replace(/"/g, '\\"')}" >}}`
  : `{{< flickr-image url="${highResImageUrl}" title="${title.replace(/"/g, '\\"')}" >}}`
}`;

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
    const existingPhotoIds = getExistingFlickrIds();
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

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];

      // Extract the photo ID first to check if we already have it
      let photoId = null;
      let photoLink = '';
      
      // Check RSS format
      if (item.link && item.link[0] && typeof item.link[0] === 'string') {
        photoLink = item.link[0];
      } 
      // Check Atom format
      else if (item.link && Array.isArray(item.link)) {
        const links = item.link;
        const photoLinkObj = links.find(l => l.$ && l.$.rel === 'alternate');
        if (photoLinkObj && photoLinkObj.$ && photoLinkObj.$.href) {
          photoLink = photoLinkObj.$.href;
        }
      }
      
      // Extract photo ID from link
      if (photoLink && typeof photoLink === 'string') {
        const idMatch = photoLink.match(/\/photos\/[^\/]+\/(\d+)/);
        photoId = idMatch ? idMatch[1] : null;
      }
      
      // Skip if we already have this photo by ID (unless forced update)
      if (photoId && existingPhotoIds[photoId] && !FORCE_UPDATE) {
        console.log(`Skipping photo ID ${photoId} (already exists as ${existingPhotoIds[photoId]})`);
        continue;
      }

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

      // Skip if we already have this photo by slug pattern (unless forced update)
      if (potentialSlugs.length > 0 && !FORCE_UPDATE) {
        console.log(`Skipping "${itemTitle}" (already exists with similar slug)`);
        continue;
      }

      // Add a delay between processing photos to avoid rate limiting
      if (i > 0) {
        console.log('Waiting 1 second before processing next photo to avoid rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const slug = await createPhotoContent(item);
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

// Run the main function asynchronously
(async () => {
  try {
    await fetchAndProcessFeed();
  } catch (error) {
    console.error('Failed to process Flickr feed:', error);
    process.exit(1);
  }
})();