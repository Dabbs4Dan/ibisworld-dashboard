document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;
});
