import LazyLoad from 'vanilla-lazyload'

const lazyLoader = () => {
  // Function to verify that tiny placeholder images are loaded
  const ensureTinyPlaceholdersLoaded = () => {
    return new Promise(resolve => {
      // Get all images with data-src attribute
      const allLazyImages = document.querySelectorAll('img[data-src]');
      
      // Track how many images need loading
      let imagesStillLoading = 0;
      
      // If no images, resolve immediately
      if (allLazyImages.length === 0) {
        resolve();
        return;
      }
      
      // For each image, make sure the tiny src is loaded first
      allLazyImages.forEach(img => {
        // If image already loaded, skip
        if (img.complete) return;
        
        // Mark as loading
        imagesStillLoading++;
        
        // Set eager loading to prioritize
        img.setAttribute('loading', 'eager');
        
        // Track loading completion
        img.onload = () => {
          imagesStillLoading--;
          if (imagesStillLoading <= 0) {
            // Small delay to ensure rendering
            setTimeout(resolve, 50);
          }
        };
        
        // Handle errors too
        img.onerror = () => {
          imagesStillLoading--;
          if (imagesStillLoading <= 0) {
            setTimeout(resolve, 50);
          }
        };
      });
      
      // If all images were already loaded, resolve immediately
      if (imagesStillLoading === 0) {
        resolve();
      }
    });
  };
  
  // Initialize LazyLoad only after tiny images are loaded
  const initLazyLoad = async () => {
    // Wait for tiny placeholders to load first
    await ensureTinyPlaceholdersLoaded();
    
    // Set up lazy loading for the larger images
    const options = {
      elements_selector: '[data-src]',
      class_loading: 'is-loading',
      class_loaded: 'is-loaded',
      class_error: 'has-error',
      use_native: false,
      threshold: 300,
      callback_loaded: (element) => {
        setTimeout(() => {
          element.classList.add('is-loaded');
        }, 500);
      }
    };
    
    // Initialize LazyLoad after small delay to ensure placeholders are visible
    setTimeout(() => {
      const lazyLoadInstance = new LazyLoad(options);
      if (lazyLoadInstance) {
        lazyLoadInstance.update();
      }
    }, 100);
  };
  
  // Start the process
  initLazyLoad();
}

export default lazyLoader