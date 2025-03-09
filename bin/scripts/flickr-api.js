#!/usr/bin/env node

/**
 * Flickr API Integration for Bram Willemse's website
 * 
 * This script uses the Flickr API to fetch the most recent photos from
 * a specified Flickr account and creates Hugo content files for them.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');
require('dotenv').config();

// Configuration
const FLICKR_USER_ID = process.env.FLICKR_USER_ID || '25787603@N08';
const FLICKR_API_KEY = process.env.FLICKR_API_KEY;
const FLICKR_API_SECRET = process.env.FLICKR_API_SECRET;
const FLICKR_OAUTH_TOKEN = process.env.FLICKR_OAUTH_TOKEN || '';
const FLICKR_OAUTH_TOKEN_SECRET = process.env.FLICKR_OAUTH_TOKEN_SECRET || '';
const PHOTO_LIMIT = parseInt(process.env.PHOTO_LIMIT || '100'); // Fetch up to 100 most recent photos by default
const CONTENT_DIR = path.join(__dirname, '../../content/photos');
const ASSETS_DIR = path.join(__dirname, '../../assets/images/photos');
const FORCE_UPDATE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const HIGH_QUALITY = !process.argv.includes('--low-quality'); // Whether to download highest quality images
const SKIP_EXIF = process.argv.includes('--skip-exif') || !FLICKR_OAUTH_TOKEN; // Skip EXIF if no auth token

// Base URL for Flickr API
const FLICKR_API_BASE = 'https://www.flickr.com/services/rest/';

// Setup OAuth 1.0a
const oauth = OAuth({
  consumer: {
    key: FLICKR_API_KEY,
    secret: FLICKR_API_SECRET
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto
      .createHmac('sha1', key)
      .update(base_string)
      .digest('base64');
  }
});

// Configure axios with better headers
const api = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 BramWillemseWebsite/1.0 (https://bramwillemse.nl)',
    'Accept': 'application/json',
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
 * Make a request to the Flickr API
 * @param {string} method - The Flickr API method to call
 * @param {Object} params - Additional parameters for the API call
 * @param {boolean} useOAuth - Whether to use OAuth authentication
 * @returns {Promise<Object>} - The API response
 */
async function callFlickrApi(method, params = {}, useOAuth = false) {
  try {
    // Common parameters for all requests
    const requestParams = {
      method,
      format: 'json',
      nojsoncallback: 1,
      ...params
    };
    
    let response;
    
    if (useOAuth && FLICKR_OAUTH_TOKEN && FLICKR_OAUTH_TOKEN_SECRET) {
      // Using OAuth 1.0a authentication
      const request = {
        url: FLICKR_API_BASE,
        method: 'GET',
        data: requestParams
      };
      
      const oauthData = oauth.authorize(request, {
        key: FLICKR_OAUTH_TOKEN,
        secret: FLICKR_OAUTH_TOKEN_SECRET
      });
      
      // Add OAuth authorization to parameters
      response = await api.get(FLICKR_API_BASE, {
        params: {
          ...requestParams,
          ...oauthData
        }
      });
    } else {
      // Using API key authentication
      response = await api.get(FLICKR_API_BASE, {
        params: {
          api_key: FLICKR_API_KEY,
          ...requestParams
        }
      });
    }

    if (response.data && response.data.stat === 'fail') {
      throw new Error(`Flickr API error: ${response.data.message}`);
    }

    return response.data;
  } catch (error) {
    if (!method.includes('getExif') || (error.message && !error.message.includes('Permission denied'))) {
      // Only log errors that aren't EXIF permission errors
      console.error(`Error calling Flickr API (${method}):`, error.message);
    }
    throw error;
  }
}

/**
 * Get photo information from Flickr API
 * @param {string} photoId - The Flickr photo ID
 * @returns {Promise<Object>} - Photo information
 */
async function getPhotoInfo(photoId) {
  return callFlickrApi('flickr.photos.getInfo', { photo_id: photoId });
}

/**
 * Get photo sizes from Flickr API
 * @param {string} photoId - The Flickr photo ID
 * @returns {Promise<Object>} - Available photo sizes
 */
async function getPhotoSizes(photoId) {
  return callFlickrApi('flickr.photos.getSizes', { photo_id: photoId });
}

/**
 * Get photo EXIF data from Flickr API
 * @param {string} photoId - The Flickr photo ID
 * @returns {Promise<Object>} - EXIF data
 */
async function getPhotoExif(photoId) {
  // Skip EXIF data retrieval if configured to do so
  if (SKIP_EXIF) {
    return { photo: { exif: [] } };
  }
  
  try {
    // Try with OAuth first if available
    if (FLICKR_OAUTH_TOKEN && FLICKR_OAUTH_TOKEN_SECRET) {
      try {
        const result = await callFlickrApi('flickr.photos.getExif', { 
          photo_id: photoId 
        }, true); // true = use OAuth
        return result;
      } catch (error) {
        // Fall back to non-OAuth if that fails
        console.log(`OAuth authentication failed for EXIF data, trying without OAuth: ${error.message}`);
      }
    }
    
    // Try without OAuth as fallback
    const result = await callFlickrApi('flickr.photos.getExif', { 
      photo_id: photoId 
    });
    return result;
  } catch (error) {
    // This is expected for non-authenticated calls or if EXIF data is private
    return { photo: { exif: [] } };
  }
}

/**
 * Download an image from Flickr
 * @param {string} url - URL to download from
 * @param {string} photoId - Flickr photo ID
 * @returns {Promise<Object>} - Download result
 */
async function downloadImage(url, photoId) {
  const filename = `flickr-${photoId}.jpg`;
  const outputPath = path.join(ASSETS_DIR, filename);
  
  // Check if file already exists
  if (fs.existsSync(outputPath) && !FORCE_UPDATE) {
    console.log(`Image already downloaded: ${filename}`);
    return { success: true, path: `images/photos/${filename}` };
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would download image from ${url} to ${outputPath}`);
    return { success: true, path: `images/photos/${filename}`, isDryRun: true };
  }
  
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
      
      // Download the image
      const response = await axios({
        url: url,
        method: 'GET',
        responseType: 'arraybuffer',
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

/**
 * Create a slug from the photo title and ID
 * @param {string} title - Photo title
 * @param {string} photoId - Flickr photo ID
 * @param {Date} takenDate - Date the photo was taken
 * @returns {string} - Generated slug
 */
function generateSlug(title, photoId, takenDate) {
  const slugTitle = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  const datePrefix = takenDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const uniqueSuffix = photoId ? `-${photoId.slice(-4)}` : '';
  
  return `${datePrefix}-${slugTitle}${uniqueSuffix}`;
}

/**
 * Get existing photo slugs to avoid duplicates
 * @returns {string[]} - Array of existing slugs
 */
function getExistingPhotoSlugs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  
  return fs.readdirSync(CONTENT_DIR)
    .filter(file => file !== '_index.md' && file.endsWith('.md'))
    .map(file => file.replace('.md', ''));
}

/**
 * Create Hugo content file for a photo
 * @param {Object} photo - Photo data
 * @returns {Promise<string>} - Generated slug
 */
async function createPhotoContent(photo) {
  try {
    // Get detailed information about the photo
    const photoInfo = await getPhotoInfo(photo.id);
    const photoSizes = await getPhotoSizes(photo.id);
    const exifData = await getPhotoExif(photo.id);
    
    const info = photoInfo.photo;
    const sizes = photoSizes.sizes.size;
    
    // Extract EXIF data we care about
    const exif = {};
    if (exifData && exifData.photo && exifData.photo.exif) {
      exifData.photo.exif.forEach(item => {
        if (item.tag === 'Model') exif.camera = item.raw._content;
        if (item.tag === 'ExposureTime') exif.exposureTime = item.raw._content;
        if (item.tag === 'FNumber') exif.aperture = item.raw._content;
        if (item.tag === 'FocalLength') exif.focalLength = item.raw._content;
        if (item.tag === 'ISO') exif.iso = item.raw._content;
      });
    }
    
    // Get the appropriate image size based on quality setting
    let downloadSize;
    
    if (HIGH_QUALITY) {
      // Get the highest resolution available
      // First try standard sizes from highest to lowest
      const highQualitySizes = [
        'Original', 
        'Large 2048', // 2048px on longest side
        'Large 1600', // 1600px on longest side
        'Large',      // 1024px on longest side
      ];
      
      // Try to find the highest preferred size
      for (const sizeLabel of highQualitySizes) {
        const size = sizes.find(s => s.label === sizeLabel);
        if (size) {
          downloadSize = size;
          break;
        }
      }
      
      // If no standard size is found, sort by dimensions and get the largest
      if (!downloadSize) {
        // Sort by width×height product to get the one with the largest area
        downloadSize = [...sizes].sort((a, b) => {
          const areaA = parseInt(a.width) * parseInt(a.height);
          const areaB = parseInt(b.width) * parseInt(b.height);
          return areaB - areaA;
        })[0];
      }
    } else {
      // For low quality mode, prefer medium-sized images to save bandwidth
      const lowQualitySizes = [
        'Large',      // 1024px on longest side
        'Medium 800', // 800px on longest side
        'Medium 640', // 640px on longest side
        'Medium',     // 500px on longest side
      ];
      
      // Try to find the preferred size for low quality
      for (const sizeLabel of lowQualitySizes) {
        const size = sizes.find(s => s.label === sizeLabel);
        if (size) {
          downloadSize = size;
          break;
        }
      }
      
      // If no standard size is found, get a mid-range one
      if (!downloadSize) {
        const sortedSizes = [...sizes].sort((a, b) => {
          const areaA = parseInt(a.width) * parseInt(a.height);
          const areaB = parseInt(b.width) * parseInt(b.height);
          return areaB - areaA;
        });
        
        // Get a size from the middle of the range if there are enough options
        const middleIndex = Math.floor(sortedSizes.length / 2);
        downloadSize = sortedSizes[middleIndex < sortedSizes.length ? middleIndex : 0];
      }
    }
    
    // For display URL in the content file, use a slightly smaller version if available
    const displaySize = sizes.find(size => size.label === 'Large 1600') || 
                        sizes.find(size => size.label === 'Large') || 
                        downloadSize;
    
    // Extract information
    const title = info.title._content || 'Untitled Photo';
    const description = info.description._content || '';
    const takenDate = new Date(info.dates.taken);
    const pubDate = new Date(info.dates.posted * 1000); // Convert from Unix timestamp
    const tags = info.tags.tag.map(tag => tag.raw);
    const photoUrl = info.urls.url.find(u => u.type === 'photopage')._content;
    
    // Download the highest resolution image
    console.log(`Downloading photo "${title}" in ${downloadSize.label} size (${downloadSize.width}x${downloadSize.height})`);
    const downloadResult = await downloadImage(downloadSize.source, photo.id);
    let localImagePath = '';
    
    if (downloadResult.success) {
      localImagePath = downloadResult.path;
    } else {
      console.warn(`Warning: Couldn't download image for ${title}, using Flickr URL instead`);
      localImagePath = displaySize.source;
    }
    
    // Generate slug
    const slug = generateSlug(title, photo.id, takenDate);
    
    // Create frontmatter
    const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${takenDate.toISOString()}
description: "Photo: ${title.replace(/"/g, '\\"')}"
author: "Bram Willemse"
type: "photos"
tags: [${tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]
flickr:
  url: "${photoUrl}"
  photo_id: "${photo.id}"
  image_url: "${displaySize.source}"
  date_taken: "${takenDate.toISOString()}"
  date_published: "${pubDate.toISOString()}"
${Object.keys(exif).length > 0 ? `  exif:
${Object.entries(exif).map(([key, value]) => `    ${key}: "${value}"`).join('\n')}` : ''}
featured_image:
  src: "/${localImagePath}"
---

{{< figure src="/${localImagePath}" title="${title.replace(/"/g, '\\"')}" >}}
${description ? `\n${description}\n` : ''}`;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would create content file: ${slug}.md`);
      return slug;
    }
    
    // Write to file
    const filePath = path.join(CONTENT_DIR, `${slug}.md`);
    fs.writeFileSync(filePath, frontmatter);
    console.log(`Created content file: ${filePath}`);
    
    return slug;
  } catch (error) {
    console.error(`Error creating content for photo ${photo.id}:`, error);
    return null;
  }
}

/**
 * Create _index.md if it doesn't exist
 */
function ensureIndexFile() {
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
}

/**
 * Main function to fetch and process photos
 */
async function fetchAndProcessPhotos() {
  try {
    console.log('Fetching recent photos from Flickr API...');
    
    // Get the user's recent photos
    const photosResponse = await callFlickrApi('flickr.people.getPhotos', {
      user_id: FLICKR_USER_ID,
      per_page: PHOTO_LIMIT,
      extras: 'date_taken'
    });
    
    if (!photosResponse || !photosResponse.photos || !photosResponse.photos.photo) {
      console.error('No photos found in the API response');
      return;
    }
    
    const photos = photosResponse.photos.photo;
    console.log(`Found ${photos.length} photos`);
    
    // Ensure the index file exists
    ensureIndexFile();
    
    // Get existing photo slugs
    const existingSlugs = getExistingPhotoSlugs();
    console.log(`Found ${existingSlugs.length} existing photos`);
    
    // Process each photo
    let newPhotos = 0;
    let processedPhotos = 0;
    
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      
      // Check if we should process this photo
      const photoDateTaken = new Date(photo.datetaken);
      const dateSlugPart = photoDateTaken.toISOString().split('T')[0];
      const potentialSlugs = existingSlugs.filter(slug => 
        slug.startsWith(dateSlugPart) && slug.includes(photo.id.slice(-4))
      );
      
      // Skip if we already have this photo (unless forced update)
      if (potentialSlugs.length > 0 && !FORCE_UPDATE) {
        console.log(`Skipping already imported photo: ${photo.title} (${photo.id})`);
        continue;
      }
      
      // Add a delay between processing photos to avoid rate limiting
      if (processedPhotos > 0) {
        console.log('Waiting 1 second before processing next photo to avoid rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Process the photo
      const slug = await createPhotoContent(photo);
      
      if (slug) {
        console.log(`Added new photo: ${slug}`);
        newPhotos++;
      }
      
      processedPhotos++;
    }
    
    console.log(`Added ${newPhotos} new photos`);
    
  } catch (error) {
    console.error('Error fetching or processing photos:');
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
(async () => {
  try {
    if (!FLICKR_API_KEY) {
      console.error('Error: FLICKR_API_KEY environment variable is not set');
      process.exit(1);
    }
    
    if (DRY_RUN) {
      console.log('Running in dry run mode - no files will be created or modified');
    }
    
    console.log(`Will download up to ${PHOTO_LIMIT} photos from Flickr user ID: ${FLICKR_USER_ID}`);
    
    if (HIGH_QUALITY) {
      console.log('Using highest quality available for image downloads');
    } else {
      console.log('Using medium quality for image downloads (use without --low-quality for highest quality)');
    }
    
    if (SKIP_EXIF) {
      console.log('EXIF data retrieval is disabled - photos will not include camera information');
    }
    
    // If OAuth tokens are provided but not used
    if (FLICKR_OAUTH_TOKEN && FLICKR_OAUTH_TOKEN_SECRET && SKIP_EXIF) {
      console.log('Note: OAuth tokens are provided but not being used because --skip-exif flag is set');
    }
    
    await fetchAndProcessPhotos();
    console.log('Script completed successfully');
  } catch (error) {
    console.error('Failed to process photos:', error);
    process.exit(1);
  }
})();