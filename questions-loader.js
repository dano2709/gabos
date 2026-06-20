(async function () {
  'use strict';

  function setError(message) {
    console.error(message);
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.textContent = message;
  }

  try {
    const b64 = window.DIPLOMAEZ_GZIP_B64 || '';

    if (!b64) {
      setError('Questions failed to load. Missing question data.');
      return;
    }

    if (!('DecompressionStream' in window)) {
      setError('This browser cannot decompress the question pack. Please use current Chrome or Edge.');
      return;
    }

    const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    window.DIPLOMAEZ_TOPICS = JSON.parse(text);

    const script = document.createElement('script');
    script.src = 'app.js?v=20260620-character';
    script.onload = function () {
      console.log('DiplomaEZ loaded with', window.DIPLOMAEZ_TOPICS.length, 'topics.');
      if (document.readyState !== 'loading') {
        document.dispatchEvent(new Event('DOMContentLoaded'));
      }
    };
    script.onerror = function () {
      setError('Game logic failed to load. Refresh the page.');
    };
    document.body.appendChild(script);
  } catch (error) {
    setError('Questions failed to load. Please refresh with Ctrl + F5.');
    console.error(error);
  }
})();