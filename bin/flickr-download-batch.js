const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

// Configuration 
// Using the NSID for Bram Willemse's account
const FLICKR_USER_ID = '25787603@N08'; // Bram's Flickr NSID
// Use the atom format instead of RSS which is more reliable
const FLICKR_FEED_URL = `https://www.flickr.com/services/feeds/photos_public.gne?id=${FLICKR_USER_ID}`;
// Increase to download 50 photos
const PHOTO_LIMIT = 50;
const CONTENT_DIR = path.join(__dirname, '../content/photos');
const ASSETS_DIR = path.join(__dirname, '../assets/images/photos');
// Force update to re-download all images
const FORCE_UPDATE = true;

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

// Helper function to scrape date taken from Flickr photo page
async function getPhotoDateTaken(photoId) {
  const url = `https://www.flickr.com/photos/${FLICKR_USER_ID}/${photoId}`;
  
  // Default to current date if we can't extract the date taken
  let dateTaken = new Date();
  
  try {
    console.log(`Fetching date taken from Flickr page for photo ${photoId}...`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
        'Referer': 'https://bramwillemse.nl'
      },
      timeout: 15000
    });
    
    // Extract the date taken from the HTML
    const html = response.data;
    
    // Look for date taken metadata in the page
    // Flickr typically includes this in a specific format
    const dateMatch = html.match(/Taken on ([A-Za-z]+ \d+, \d{4})/i) || 
                     html.match(/data-date-taken="([^"]+)"/i) ||
                     html.match(/"date_taken":"([^"]+)"/i) ||
                     html.match(/data-date-taken=\\?"([^"\\]+)\\?"/i) ||
                     html.match(/data-track="photo-taken-date">Taken on ([^<]+)<\/a>/i) ||
                     html.match(/class="photo-date">Taken on ([^<]+)<\/span>/i) ||
                     html.match(/class="date-taken">([^<]+)<\/span>/i);
    
    if (dateMatch && dateMatch[1]) {
      try {
        // Parse the date found in the page
        const dateTakenStr = dateMatch[1];
        console.log(`Found date taken: ${dateTakenStr}`);
        
        // Try various date formats that might be used
        dateTaken = new Date(dateTakenStr);
        
        // Verify it's a valid date - if not, fall back to default
        if (isNaN(dateTaken.getTime())) {
          console.warn(`Invalid date: ${dateTakenStr}, using fallback`);
          dateTaken = new Date();
        }
      } catch (e) {
        console.warn(`Error parsing date taken: ${e.message}, using fallback date`);
      }
    } else {
      console.warn(`Could not find date taken for photo ${photoId}, using fallback date`);
    }
    
    return dateTaken;
  } catch (error) {
    console.error(`Error fetching date taken for photo ${photoId}: ${error.message}`);
    return dateTaken;
  }
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
  
  // Try to get the actual date taken from Flickr
  if (photoId) {
    try {
      // Add some delay to avoid rate limiting
      await delay(2000);
      
      // Get the date taken from the Flickr page
      const actualDateTaken = await getPhotoDateTaken(photoId);
      
      // Override the date taken if we got a good value
      if (actualDateTaken && !isNaN(actualDateTaken.getTime())) {
        takenDate = actualDateTaken;
        console.log(`Using scraped date taken: ${takenDate.toISOString()}`);
      }
    } catch (error) {
      console.warn(`Could not get actual date taken: ${error.message}`);
    }
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

// Helper function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to fetch Flickr photos directly from the REST API to get more than 20 recent photos
async function fetchPhotosFromRestApi() {
  const apiKey = '6244db85faf48e83f4e4bc3a1c4e2abe'; // Public Flickr API key for this purpose
  const photoCount = 50;
  const perPage = 50;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Fetching recent ${photoCount} photos from Flickr for user ${FLICKR_USER_ID}... (attempt ${attempt}/${maxAttempts})`);
      
      // Add a longer delay between API calls to avoid rate limiting
      if (attempt > 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${waitTime/1000} seconds before retry...`);
        await delay(waitTime);
      }
      
      // Let's try to use the atom feed directly since the REST API is failing
      // This will get fewer photos but is more likely to work
      console.log('Trying Atom feed directly...');
      return await fetchFromAtomFeed();
      
    } catch (error) {
      console.error(`Error fetching photos from Flickr API (attempt ${attempt}/${maxAttempts}):`, error.message);
      
      if (attempt === maxAttempts) {
        console.error('Maximum retry attempts reached. Falling back to existing feed method...');
        return await fetchFromAtomFeed();
      }
    }
  }
}

// Fallback function to fetch from Atom feed
async function fetchFromAtomFeed() {
  console.log('Attempting to fetch photos from Atom feed as a fallback...');
  
  try {
    const response = await api.get(FLICKR_FEED_URL);
    const xmlData = response.data;
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);
    
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
      return [];
    }
    
    console.log(`Found ${items.length} photos in the Flickr feed`);
    return items;
  } catch (error) {
    console.error('Error fetching from Atom feed:', error.message);
    return [];
  }
}

// Function to convert REST API photos to the format needed by createPhotoContent
function convertRestApiPhoto(photo) {
  return {
    title: [photo.title],
    link: [`https://www.flickr.com/photos/${FLICKR_USER_ID}/${photo.id}`],
    pubDate: [new Date(parseInt(photo.dateupload) * 1000).toISOString()],
    description: [
      `<p><a href="https://www.flickr.com/people/${FLICKR_USER_ID}/">Bram Willemse</a> posted a photo:</p> <p><a href="https://www.flickr.com/photos/${FLICKR_USER_ID}/${photo.id}" title="${photo.title}"><img src="${photo.url_m}" width="${photo.width_m}" height="${photo.height_m}" alt="${photo.title}" /></a></p>${photo.description && photo.description._content ? photo.description._content : ''}`
    ],
    'dc:creator': ['bramwillemse'],
    category: photo.tags.split(' ').filter(tag => tag).map(tag => ({ 
      $: { term: tag }
    }))
  };
}

// Main function to fetch and process photos
async function downloadLatestPhotos() {
  try {
    // Get photos directly from the Flickr REST API or fallback to Atom feed
    const photos = await fetchPhotosFromRestApi();
    
    if (!photos || photos.length === 0) {
      console.error('No photos found to process');
      return;
    }
    
    const existingSlugs = getExistingPhotoSlugs();
    console.log(`Found ${existingSlugs.length} existing photos`);
    
    // Limit the number of photos to process
    const photosToProcess = photos.slice(0, PHOTO_LIMIT);
    console.log(`Processing ${photosToProcess.length} most recent photos`);
    
    let newPhotos = 0;
    let downloadedPhotos = 0;
    
    // Process photos in smaller batches to avoid rate limiting
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 10000; // 10 seconds between batches
    const batches = [];
    
    // Split photos into batches
    for (let i = 0; i < photosToProcess.length; i += BATCH_SIZE) {
      batches.push(photosToProcess.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Split processing into ${batches.length} batches of ${BATCH_SIZE} photos`);
    
    // Process each batch with delays between batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\nProcessing batch ${batchIndex + 1} of ${batches.length}...`);
      
      // Add delay between batches
      if (batchIndex > 0) {
        console.log(`Waiting ${BATCH_DELAY / 1000} seconds before next batch to avoid rate limiting...`);
        await delay(BATCH_DELAY);
      }
      
      // Process photos in current batch
      for (let i = 0; i < batch.length; i++) {
        const photo = batch[i];
        
        // Add a delay between processing photos
        if (i > 0) {
          console.log('Waiting 3 seconds before processing next photo...');
          await delay(3000);
        }
        
        const photoIndex = batchIndex * BATCH_SIZE + i + 1;
        
        try {
          // Skip conversion - just use the photo directly since we're handling both formats
          // in the createPhotoContent function
          const slug = await createPhotoContent(photo);
          console.log(`Processed photo ${photoIndex}/${photosToProcess.length}: ${slug}`);
          downloadedPhotos++;
        } catch (error) {
          const photoId = photo.id || 'unknown';
          console.error(`Error processing photo ${photoId}:`, error.message);
        }
      }
      
      console.log(`Completed batch ${batchIndex + 1}`);
    }
    
    console.log(`\nSuccessfully downloaded ${downloadedPhotos} out of ${photosToProcess.length} photos`);
    
  } catch (error) {
    console.error('Error fetching or processing Flickr photos:');
    console.error(error);
    process.exit(1);
  }
}

// Run the download function
(async () => {
  try {
    await downloadLatestPhotos();
  } catch (error) {
    console.error('Failed to download Flickr photos:', error);
    process.exit(1);
  }
})();