import LazyLoad from 'vanilla-lazyload'

const lazyLoader = () => {
  const options = {
    elements_selector: '[data-src]', // Only target elements with data-src
    class_loading: 'is-loading',
    class_loaded: 'is-loaded',
    class_error: 'has-error',
    use_native: true, // Fixed typo: was "user_native"
    threshold: 300, // Load images 300px before they appear in viewport
    callback_loaded: (element) => {
      // Add a small delay to allow image painting before removing blur
      setTimeout(() => {
        element.classList.add('is-loaded');
      }, 50);
    }
  }

  const lazyLoadInstance = new LazyLoad(options)

  if (lazyLoadInstance) {
    lazyLoadInstance.update()
  }
}

export default lazyLoader