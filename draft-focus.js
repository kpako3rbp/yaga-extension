(() => {
  const NOTICE_ID = 'jaga-description-draft-notice';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';

  document.addEventListener(
    'focusout',
    (event) => {
      const editor = event.target instanceof Element ? event.target.closest(EDITOR_SELECTOR) : null;
      if (!editor) return;

      window.setTimeout(() => {
        if (document.activeElement === editor) return;
        document.getElementById(NOTICE_ID)?.remove();
      }, 0);
    },
    true,
  );
})();
