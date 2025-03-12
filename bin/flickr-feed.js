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
// Use the Flickr API instead of RSS feed to get more photos
const FLICKR_FEED_URL = `https://www.flickr.com/services/feeds/photos_public.gne?id=${FLICKR_USER_ID}`; // Fallback
const FLICKR_API_URL = `https://www.flickr.com/services/rest/?method=flickr.people.getPublicPhotos&api_key=${FLICKR_API_KEY}&user_id=${FLICKR_USER_ID}&extras=date_taken,description,tags,url_m&per_page=100&format=json&nojsoncallback=1`;
// Limit to 200 most recent photos 
const PHOTO_LIMIT = 200;
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

/**
 * Function to get all available sizes for a Flickr photo using the Flickr API
 * Uses flickr.photos.getSizes endpoint to fetch all available sizes
 * @param {string} photoId - The Flickr photo ID
 * @returns {Promise<Array>} - An array of available sizes with URLs
 */
async function getFlickrPhotoSizes(photoId) {
  if (!FLICKR_API_KEY) {
    throw new Error("Flickr API key not found. Please set FLICKR_API_KEY in your environment variables.");
  }

  try {
    // Construct the Flickr API URL for getSizes
    const apiUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.getSizes&api_key=${FLICKR_API_KEY}&photo_id=${photoId}&format=json&nojsoncallback=1`;
    
    console.log(`Fetching available sizes for photo ID: ${photoId}`);
    
    // Add retry logic for API call
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Add delay between retries
        if (attempts > 0) {
          const delay = Math.pow(2, attempts) * 1000;
          console.log(`Waiting ${delay/1000} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 BramWillemseWebsite/1.0 (https://bramwillemse.nl)',
            'Accept': 'application/json',
            'Referer': 'https://bramwillemse.nl'
          },
          timeout: 10000
        });
        
        // Check if the API response is valid
        if (response.data && response.data.sizes && response.data.sizes.size) {
          return response.data.sizes.size;
        } else {
          throw new Error(`Invalid API response: ${JSON.stringify(response.data)}`);
        }
      } catch (error) {
        console.error(`Error fetching photo sizes (attempt ${attempts + 1}/${maxAttempts}): ${error.message}`);
        attempts++;
        
        if (attempts >= maxAttempts) {
          throw error; // Re-throw after exhausting all attempts
        }
      }
    }
  } catch (error) {
    console.error(`Failed to fetch photo sizes from Flickr API: ${error.message}`);
    return []; // Return empty array on failure
  }
}

/**
 * Function to download an image from Flickr with retry logic
 * Downloads the best available size according to preference order:
 * 1. Large 2048 (k suffix) - 2048px on longest side
 * 2. Large 1024 (b suffix) - 1024px on longest side
 * 3. Original (o suffix) - highest quality but largest file size
 * 
 * @param {string} imageUrl - The base image URL (typically thumbnail)
 * @param {string} photoId - The Flickr photo ID
 * @returns {Promise<Object>} - Result object with success status and path
 */
async function downloadImage(imageUrl, photoId) {
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
      // We'll return a URL that might not exist, but it doesn't matter in sample mode
      return { success: true, path: imageUrl.replace(/_m\.jpg$/, '_k.jpg'), isSample: false };
    } catch (error) {
      console.error(`Error setting up sample image: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  try {
    // Fetch available sizes from Flickr API
    const availableSizes = await getFlickrPhotoSizes(photoId);
    
    if (!availableSizes || availableSizes.length === 0) {
      console.warn(`No sizes found for photo ${photoId}, falling back to URL pattern method`);
      // Fall back to URL pattern method if API fails
      return await downloadImageByUrlPattern(imageUrl, photoId, outputPath);
    }
    
    // Define our size preferences with labels and identifiers
    const sizePreferences = [
      { label: "Large 2048", identifier: "Large 2048", suffix: "_k" },
      { label: "Large", identifier: "Large", suffix: "_b" },
      { label: "Original", identifier: "Original", suffix: "_o" }
    ];
    
    // Log available sizes for debugging
    console.log(`Found ${availableSizes.length} available sizes for photo ${photoId}`);
    
    // Find the best size according to our preferences
    let bestSizeUrl = null;
    let bestSizeLabel = null;
    
    // First try to match by Flickr's label
    for (const pref of sizePreferences) {
      const matchedSize = availableSizes.find(s => s.label === pref.identifier);
      if (matchedSize) {
        bestSizeUrl = matchedSize.source;
        bestSizeLabel = pref.label;
        break;
      }
    }
    
    // If no match by label, try to match by URL suffix
    if (!bestSizeUrl) {
      for (const pref of sizePreferences) {
        const matchedSize = availableSizes.find(s => s.source && s.source.includes(pref.suffix));
        if (matchedSize) {
          bestSizeUrl = matchedSize.source;
          bestSizeLabel = pref.label;
          break;
        }
      }
    }
    
    // If we still don't have a match, use the largest available size
    if (!bestSizeUrl && availableSizes.length > 0) {
      // Sort by width*height to get the largest size
      const sortedSizes = [...availableSizes].sort((a, b) => 
        (b.width * b.height) - (a.width * a.height)
      );
      bestSizeUrl = sortedSizes[0].source;
      bestSizeLabel = `Largest available (${sortedSizes[0].label})`;
    }
    
    // If we have a URL to download, proceed
    if (bestSizeUrl) {
      console.log(`Selected best available size: ${bestSizeLabel} (${bestSizeUrl})`);
      return await downloadImageWithRetry(bestSizeUrl, photoId, outputPath);
    } else {
      throw new Error("No suitable image size found");
    }
  } catch (error) {
    console.error(`Error in size selection process: ${error.message}`);
    
    // Fall back to URL pattern method as a last resort
    console.log("Falling back to URL pattern method...");
    return await downloadImageByUrlPattern(imageUrl, photoId, outputPath);
  }
}

/**
 * Fallback method that tries to download image by constructing URLs with different size suffixes
 * @param {string} imageUrl - The base image URL 
 * @param {string} photoId - The Flickr photo ID
 * @param {string} outputPath - Path where the image should be saved
 * @returns {Promise<Object>} - Result object with success status and path
 */
async function downloadImageByUrlPattern(imageUrl, photoId, outputPath) {
  // Start with the thumbnail URL and prepare our size variants to try
  const baseUrl = imageUrl.replace(/_m\.jpg$/, '');
  const sizeOptions = [
    { url: `${baseUrl}_k.jpg`, label: "Large 2048" },
    { url: `${baseUrl}_b.jpg`, label: "Large 1024" },
    { url: `${baseUrl}_o.jpg`, label: "Original" }
  ];
  
  // Try each size URL in order
  for (let sizeIndex = 0; sizeIndex < sizeOptions.length; sizeIndex++) {
    const currentOption = sizeOptions[sizeIndex];
    console.log(`Trying ${currentOption.label} (${sizeIndex + 1}/${sizeOptions.length}): ${currentOption.url}`);
    
    const result = await downloadImageWithRetry(currentOption.url, photoId, outputPath);
    if (result.success) {
      return { ...result, usedUrl: currentOption.url };
    }
  }
  
  // If we get here, all URLs failed
  console.error(`Failed to download image for photo ID ${photoId} after trying all size options`);
  return { success: false, error: "All image size options failed" };
}

/**
 * Helper function to download an image with retry logic
 * @param {string} url - URL to download
 * @param {string} photoId - Flickr photo ID (for logging)
 * @param {string} outputPath - Path where the image should be saved
 * @returns {Promise<Object>} - Result object with success status and path
 */
async function downloadImageWithRetry(url, photoId, outputPath) {
  // Add retry logic for downloading
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      console.log(`Downloading image from ${url} (attempt ${attempts + 1}/${maxAttempts})`);

      // Add delay between retries
      if (attempts > 0) {
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Download the image directly with arraybuffer response type
      const response = await axios({
        url: url,
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

      console.log(`Successfully downloaded from ${url}`);
      console.log(`Saved image to: ${outputPath}`);
      
      // Get file size for logging
      const stats = fs.statSync(outputPath);
      const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`File size: ${fileSizeInMB} MB`);
      
      return { success: true, path: `images/photos/${path.basename(outputPath)}`, usedUrl: url };
    } catch (error) {
      console.error(`Error downloading image ${url} (attempt ${attempts + 1}/${maxAttempts}): ${error.message}`);
      attempts++;
      
      if (attempts >= maxAttempts) {
        console.log(`Failed to download ${url} after ${maxAttempts} attempts.`);
        return { success: false, error: error.message };
      }
    }
  }
  
  return { success: false, error: "Maximum retry attempts exceeded" };
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

/**
 * Create a Hugo content file for a photo
 * Handles data from both the Flickr API and RSS/Atom feed formats
 * @param {Object} photo - Photo data from Flickr API or RSS/Atom feed
 * @returns {Promise<string>} - The slug of the created content file
 */
async function createPhotoContent(photo) {
  // Extract data from the photo (handling both API and RSS/Atom formats)
  let title, link, pubDate, takenDate, description, imageUrl, author, categories, photoId;

  // Check if it's Flickr API format (has id field directly)
  if (photo.id) {
    photoId = photo.id;
    title = photo.title || 'Untitled Photo';
    
    // Construct photo page URL from photo ID and owner
    link = `https://www.flickr.com/photos/${FLICKR_USER_ID}/${photoId}`;
    
    // Get publication date
    pubDate = photo.dateupload ? new Date(photo.dateupload * 1000) : new Date();
    
    // Get date taken if available
    if (photo.datetaken) {
      try {
        takenDate = new Date(photo.datetaken);
      } catch (e) {
        takenDate = pubDate;
        console.log(`Failed to parse taken date: ${photo.datetaken}, using upload date instead`);
      }
    } else {
      takenDate = pubDate;
    }
    
    // Get image URL - either from extras or construct it
    if (photo.url_m) {
      imageUrl = photo.url_m;
    } else {
      // Construct URL if not directly provided
      // Format: https://live.staticflickr.com/{server}/{id}_{secret}_m.jpg
      imageUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`;
    }
    
    // Get description and author
    description = photo.description ? photo.description._content || photo.description : '';
    author = 'Bram Willemse'; // Default author
    
    // Get tags (comma-separated string in API response)
    if (photo.tags) {
      categories = photo.tags.split(' ').filter(tag => tag.trim() !== '');
    } else {
      categories = [];
    }
  }
  // Check if it's RSS format
  else if (photo.title && photo.link && photo.pubDate) {
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

  // Use the URL of the successfully downloaded image (from the API call or URL pattern)
  // This ensures we reference exactly the same image URL in the markdown file
  // If download failed, fall back to a reasonable default URL
  const highResImageUrl = downloadResult && downloadResult.usedUrl ? 
    downloadResult.usedUrl : 
    imageUrl.replace(/_m\.jpg$/, '_k.jpg');

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

/**
 * Main function to fetch and process photos from Flickr
 * Uses Flickr API to fetch up to 500 photos (much more than the RSS feed limit of 20)
 */
async function fetchAndProcessFeed() {
  try {
    let photoData = [];

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

      // Parse sample XML data
      const xmlData = fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);
      
      if (result.rss && result.rss.channel && result.rss.channel[0].item) {
        photoData = result.rss.channel[0].item;
      } else if (result.feed && result.feed.entry) {
        photoData = result.feed.entry;
      }
    } else {
      console.log('Fetching photos from Flickr API...');

      try {
        // Use pagination to fetch up to 200 photos (2 pages of 100 photos each)
        let allPhotos = [];
        const maxPages = Math.ceil(PHOTO_LIMIT / 100); // 2 pages for 200 photos

        for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
          // Add page parameter to URL
          const paginatedUrl = `${FLICKR_API_URL}&page=${currentPage}`;
          
          console.log(`Fetching page ${currentPage} of ${maxPages} from Flickr API...`);
          
          // Add delay between page requests to avoid rate limiting
          if (currentPage > 1) {
            console.log('Waiting 3 seconds before fetching next page...');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          const response = await axios.get(paginatedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 BramWillemseWebsite/1.0 (https://bramwillemse.nl)',
              'Accept': 'application/json',
              'Referer': 'https://bramwillemse.nl'
            },
            timeout: 15000
          });
          
          if (response.data && response.data.photos && response.data.photos.photo && response.data.photos.photo.length > 0) {
            console.log(`Successfully fetched ${response.data.photos.photo.length} photos from page ${currentPage}`);
            allPhotos = [...allPhotos, ...response.data.photos.photo];
            
            // If we've hit the total number of photos available, break out of the loop
            if (response.data.photos.page >= response.data.photos.pages) {
              console.log(`Reached the last page (${response.data.photos.page}) of photos`);
              break;
            }
          } else {
            console.warn(`No photos returned from page ${currentPage} or invalid response format`);
            break;
          }
        }
        
        if (allPhotos.length > 0) {
          console.log(`Successfully fetched a total of ${allPhotos.length} photos from Flickr API`);
          photoData = allPhotos;
        } else {
          throw new Error('No photos returned from API or invalid response format');
        }
      } catch (apiError) {
        console.error(`Error fetching from Flickr API: ${apiError.message}`);
        console.log('Falling back to RSS feed...');
        
        // Fallback to the RSS feed (only gives us 20 photos)
        // Add retry logic for the RSS feed
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            console.log(`RSS feed attempt ${attempts + 1} of ${maxAttempts}...`);
            const response = await api.get(FLICKR_FEED_URL);
            const xmlData = response.data;
            
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlData);
            
            // Check for different feed formats (RSS or Atom)
            if (result.rss && result.rss.channel && result.rss.channel[0].item) {
              // Handle RSS format
              photoData = result.rss.channel[0].item;
              break;
            } else if (result.feed && result.feed.entry) {
              // Handle Atom format
              photoData = result.feed.entry;
              break;
            } else {
              throw new Error('No photos found in the feed or invalid feed format');
            }
          } catch (err) {
            attempts++;
            if (attempts >= maxAttempts) {
              throw err; // Rethrow if we've exhausted all attempts
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, attempts) * 1000;
            console.log(`RSS feed request failed, retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    const existingSlugs = getExistingPhotoSlugs();
    const existingPhotoIds = getExistingFlickrIds();
    console.log(`Found ${existingSlugs.length} existing photos`);
    console.log(`Found ${photoData.length} photos in Flickr`);

    // Limit the number of photos to process
    const itemsToProcess = photoData.slice(0, PHOTO_LIMIT);
    console.log(`Processing ${itemsToProcess.length} most recent photos`);

    let newPhotos = 0;
    let updatedPhotos = 0;
    let downloadedPhotos = 0;

    // Process photos in larger batches since we're using paid API
    const BATCH_SIZE = 20; // Increase batch size for paid API
    const batches = [];
    
    // Split photos into batches
    for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
      batches.push(itemsToProcess.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Split processing into ${batches.length} batches of ${BATCH_SIZE} photos`);
    
    // Process each batch with delays between batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\nProcessing batch ${batchIndex + 1} of ${batches.length}...`);
      
      // Minimal delay between batches is sufficient for paid API
      if (batchIndex > 0) {
        console.log(`Small delay between batches to prevent rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process photos in current batch
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const photoIndex = batchIndex * BATCH_SIZE + i + 1;
        
        // No delay needed between photos when using paid API
        // We've already implemented batch processing which should be sufficient
        
        // Extract photo ID based on data source (API or RSS/Atom)
        let photoId = null;
        
        // API format (directly provides id)
        if (item.id) {
          photoId = item.id;
        } 
        // RSS/Atom format (need to extract from link)
        else {
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
        }
        
        if (!photoId) {
          console.warn(`Couldn't extract photo ID for item ${photoIndex}, skipping...`);
          continue;
        }
        
        const existingFile = existingPhotoIds[photoId];
        const isUpdate = FORCE_UPDATE && existingFile;
        
        // Skip if we already have this photo and not forcing update
        if (existingFile && !FORCE_UPDATE) {
          console.log(`Skipping photo ID ${photoId} (already exists as ${existingFile})`);
          continue;
        }

        try {
          const slug = await createPhotoContent(item);
          downloadedPhotos++;
          
          if (isUpdate) {
            console.log(`Updated photo ${photoIndex}/${itemsToProcess.length}: ${slug} (previously ${existingFile})`);
            updatedPhotos++;
          } else {
            console.log(`Added new photo ${photoIndex}/${itemsToProcess.length}: ${slug}`);
            newPhotos++;
          }
        } catch (error) {
          console.error(`Error processing photo ${photoId}: ${error.message}`);
        }
      }
      
      console.log(`Completed batch ${batchIndex + 1}`);
    }

    console.log(`Successfully processed ${downloadedPhotos} out of ${itemsToProcess.length} photos`);
    console.log(`Added ${newPhotos} new photos, updated ${updatedPhotos} existing photos`);
  } catch (error) {
    console.error('Error fetching or processing Flickr photos:');
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