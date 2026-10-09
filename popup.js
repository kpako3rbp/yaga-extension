(() => {
  const STORAGE_KEY = 'jagaDescriptionDraftsEnabled';
  const toggle = document.getElementById('drafts-toggle');

  chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
    toggle.checked = Boolean(result[STORAGE_KEY]);
  });

  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEY]: toggle.checked });
  });
})();
