(() => {
  const DRAFTS_STORAGE_KEY = 'jagaDescriptionDrafts';
  const DRAFTS_ENABLED_STORAGE_KEY = 'jagaDescriptionDraftsEnabled';
  const NEW_TASK_SESSION_KEY = 'jagaNewTaskDraftId';
  const MAX_DRAFTS = 5;
  const SAVE_DELAY = 300;

  const ATTRIBUTE_WRAPPER_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';
  const ATTRIBUTE_LABEL_SELECTOR = '[data-class="AttributeLabel_title"]';
  const EDITOR_FIELD_SELECTOR = '[data-class="AttributeTextEditor_wrapper"]';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';
  const TASK_TITLE_SELECTOR = '[data-class="TaskTypeHeader_title_2"]';

  const NOTICE_ID = 'jaga-description-draft-notice';
  const STYLE_ID = 'jaga-description-draft-styles';

  let draftsEnabled = false;
  let observedEditor = null;
  let observedEditorField = null;
  let inputHandler = null;
  let editorFieldClickHandler = null;
  let editorMutationObserver = null;
  let saveTimer = null;
  let currentDraftKey = null;
  let lastPathname = location.pathname;
  let noticeAnchor = null;

  const storageGet = (key, fallback) =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [key]: fallback }, (result) => resolve(result[key]));
    });

  const storageSet = (value) =>
    new Promise((resolve) => {
      chrome.storage.local.set(value, resolve);
    });

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const createId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const getDescriptionWrapper = () => {
    const wrappers = document.querySelectorAll(ATTRIBUTE_WRAPPER_SELECTOR);

    return Array.from(wrappers).find((wrapper) => {
      const label = wrapper.querySelector(ATTRIBUTE_LABEL_SELECTOR);
      return label?.textContent?.trim() === 'Описание';
    });
  };

  const getDescriptionEditorField = () =>
    getDescriptionWrapper()?.querySelector(EDITOR_FIELD_SELECTOR) ?? null;

  const getDescriptionEditor = () =>
    getDescriptionWrapper()?.querySelector(EDITOR_SELECTOR) ?? null;

  const getTaskTitle = () => {
    const taskTitle = document.querySelector(TASK_TITLE_SELECTOR)?.textContent?.trim();
    if (taskTitle) return taskTitle;

    return document.title.replace(/\s+-\s+Яга\s*$/, '').trim() || 'Новая задача';
  };

  const getProjectId = () => {
    const projectLink = document.querySelector('a[href^="/project/"]');
    const match = projectLink?.getAttribute('href')?.match(/^\/project\/(\d+)/);
    return match?.[1] ?? 'unknown';
  };

  const getDraftIdentity = () => {
    const existingTaskMatch = location.pathname.match(/^\/browse\/([^/?#]+)/);

    if (existingTaskMatch) {
      const taskKey = decodeURIComponent(existingTaskMatch[1]);

      return {
        key: `task:${taskKey}`,
        taskKey,
        isNew: false,
      };
    }

    if (!getDescriptionWrapper()) return null;

    let temporaryId = sessionStorage.getItem(NEW_TASK_SESSION_KEY);

    if (!temporaryId) {
      temporaryId = createId();
      sessionStorage.setItem(NEW_TASK_SESSION_KEY, temporaryId);
    }

    return {
      key: `new:${getProjectId()}:${temporaryId}`,
      taskKey: null,
      isNew: true,
    };
  };

  const getDrafts = async () => {
    const drafts = await storageGet(DRAFTS_STORAGE_KEY, []);
    return Array.isArray(drafts) ? drafts : [];
  };

  const setDrafts = async (drafts) => {
    const sortedDrafts = [...drafts]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DRAFTS);

    await storageSet({ [DRAFTS_STORAGE_KEY]: sortedDrafts });
  };

  const removeDraft = async (key) => {
    const drafts = await getDrafts();
    await setDrafts(drafts.filter((draft) => draft.key !== key));
  };

  const saveDraft = async (editor) => {
    if (!draftsEnabled) return;

    const identity = getDraftIdentity();
    if (!identity || !editor?.isConnected) return;

    const drafts = await getDrafts();
    const nextDraft = {
      key: identity.key,
      taskKey: identity.taskKey,
      isNew: identity.isNew,
      title: getTaskTitle(),
      url: location.href,
      html: editor.innerHTML,
      text: editor.textContent?.trim() ?? '',
      updatedAt: Date.now(),
    };

    await setDrafts([nextDraft, ...drafts.filter((draft) => draft.key !== identity.key)]);
    currentDraftKey = identity.key;
  };

  const scheduleSave = (editor) => {
    if (!draftsEnabled) return;

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft(editor), SAVE_DELAY);
  };

  const formatDraftTime = (timestamp) => {
    const date = new Date(timestamp);
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${date.getDate()} ${months[date.getMonth()]} в ${hours}:${minutes}`;
  };

  const getDraftHeading = (draft) =>
    draft.isNew
      ? 'Найден черновик описания для новой задачи'
      : `Найден черновик описания для задачи ${draft.taskKey}`;

  const positionNotice = () => {
    const notice = document.getElementById(NOTICE_ID);
    if (!notice || !noticeAnchor?.isConnected) return;

    const rect = noticeAnchor.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 12;
    const maxWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
    const width = Math.max(260, Math.min(maxWidth, Math.max(rect.width, 320)));

    let left = rect.left;
    if (left + width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - width - viewportPadding;
    }
    left = Math.max(viewportPadding, left);

    let top = rect.bottom + gap;
    const noticeHeight = notice.offsetHeight;

    if (top + noticeHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - noticeHeight - gap);
    }

    notice.style.width = `${width}px`;
    notice.style.left = `${left}px`;
    notice.style.top = `${top}px`;
  };

  const removeNotice = () => {
    document.getElementById(NOTICE_ID)?.remove();
    noticeAnchor = null;
  };

  const focusEditorAtEnd = (editor) => {
    if (!editor?.isConnected) return;

    editor.focus({ preventScroll: true });

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const replaceEditorContent = (editor, html) => {
    focusEditorAtEnd(editor);

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);

    const inserted = document.execCommand('insertHTML', false, html);

    if (!inserted) {
      editor.innerHTML = html;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }

    return true;
  };

  const applyDraftToEditor = (draft) => {
    const editor = getDescriptionEditor();
    if (!editor) return false;

    if (!replaceEditorContent(editor, draft.html)) return false;

    window.requestAnimationFrame(() => {
      const currentEditor = getDescriptionEditor();
      if (!currentEditor) return;

      focusEditorAtEnd(currentEditor);
      scheduleSave(currentEditor);
    });

    return true;
  };

  const restoreDraft = (draft) => {
    const editor = getDescriptionEditor();
    if (!editor) return;

    focusEditorAtEnd(editor);

    if (applyDraftToEditor(draft)) {
      removeNotice();
    }
  };

  const showRecoveryNotice = (draft, anchor) => {
    if (!draftsEnabled || document.getElementById(NOTICE_ID) || !document.body) return;

    const notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.innerHTML = `
      <div class="jaga-draft__content">
        <strong>${escapeHtml(getDraftHeading(draft))}</strong>
        <span>Сохранен ${escapeHtml(formatDraftTime(draft.updatedAt))}</span>
      </div>
      <div class="jaga-draft__actions">
        <button type="button" data-action="restore">Восстановить описание</button>
        <button type="button" data-action="remove">Удалить черновик</button>
      </div>
    `;

    notice.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });

    notice.querySelector('[data-action="restore"]').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      restoreDraft(draft);
    });

    notice.querySelector('[data-action="remove"]').addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      await removeDraft(draft.key);
      removeNotice();

      const editor = getDescriptionEditor();
      if (editor) focusEditorAtEnd(editor);
    });

    noticeAnchor = anchor;
    document.body.appendChild(notice);
    positionNotice();
  };

  const checkForRecoverableDraft = async () => {
    if (!draftsEnabled) return;

    const editorField = getDescriptionEditorField();
    const editor = getDescriptionEditor();
    const identity = getDraftIdentity();

    if (!editorField || !editor || !identity) return;

    const drafts = await getDrafts();
    const draft = drafts.find((item) => item.key === identity.key);

    if (!draft) {
      removeNotice();
      return;
    }

    if (draft.html === editor.innerHTML) {
      await removeDraft(draft.key);
      removeNotice();
      return;
    }

    showRecoveryNotice(draft, editorField);
  };

  const unbindEditor = () => {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    removeNotice();

    if (observedEditor && inputHandler) {
      observedEditor.removeEventListener('input', inputHandler);
    }

    if (observedEditorField && editorFieldClickHandler) {
      observedEditorField.removeEventListener('click', editorFieldClickHandler, true);
    }

    editorMutationObserver?.disconnect();
    editorMutationObserver = null;
    observedEditor = null;
    observedEditorField = null;
    inputHandler = null;
    editorFieldClickHandler = null;
  };

  const bindEditor = () => {
    if (!draftsEnabled) return;

    const editorField = getDescriptionEditorField();
    const editor = getDescriptionEditor();

    if (observedEditorField !== editorField) {
      if (observedEditorField && editorFieldClickHandler) {
        observedEditorField.removeEventListener('click', editorFieldClickHandler, true);
      }

      observedEditorField = editorField;
      editorFieldClickHandler = null;

      if (editorField) {
        editorFieldClickHandler = () => {
          window.setTimeout(() => {
            bindEditor();

            const currentEditor = getDescriptionEditor();
            if (!currentEditor) return;

            if (document.activeElement === currentEditor || currentEditor.matches(':focus')) {
              checkForRecoverableDraft();
            }
          }, 0);
        };

        editorField.addEventListener('click', editorFieldClickHandler, true);
      }
    }

    if (editor === observedEditor) return;

    if (observedEditor && inputHandler) {
      observedEditor.removeEventListener('input', inputHandler);
    }

    editorMutationObserver?.disconnect();
    editorMutationObserver = null;
    observedEditor = editor;
    inputHandler = null;

    if (!editor) return;

    inputHandler = () => scheduleSave(editor);
    editor.addEventListener('input', inputHandler);

    editorMutationObserver = new MutationObserver(() => scheduleSave(editor));
    editorMutationObserver.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const handleRouteChange = async () => {
    if (lastPathname === location.pathname) return;

    const previousPathname = lastPathname;
    lastPathname = location.pathname;
    removeNotice();

    const previousWasNew = !/^\/browse\//.test(previousPathname);
    const currentTaskMatch = location.pathname.match(/^\/browse\/([^/?#]+)/);

    if (previousWasNew && currentTaskMatch && currentDraftKey?.startsWith('new:')) {
      await removeDraft(currentDraftKey);
      currentDraftKey = null;
      sessionStorage.removeItem(NEW_TASK_SESSION_KEY);
    }

    observedEditor = null;
    observedEditorField = null;
    bindEditor();
  };

  const setDraftsEnabled = (enabled) => {
    draftsEnabled = Boolean(enabled);

    if (draftsEnabled) {
      bindEditor();
    } else {
      unbindEditor();
    }
  };

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${NOTICE_ID} {
        position: fixed;
        z-index: 1000000;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #fff;
        border: 1px solid rgba(208, 212, 220, 1);
        border-radius: 10px;
        box-sizing: border-box;
        color: rgba(16, 24, 40, 1);
        box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        line-height: 18px;
      }

      #${NOTICE_ID} .jaga-draft__content {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      #${NOTICE_ID} .jaga-draft__content strong {
        display: block;
        font-size: 14px;
        line-height: 18px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      #${NOTICE_ID} .jaga-draft__content span {
        color: rgba(131, 137, 151, 1);
      }

      #${NOTICE_ID} .jaga-draft__actions {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 8px;
      }

      #${NOTICE_ID} button {
        min-width: 0;
        min-height: 36px;
        padding: 7px 10px;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        line-height: 16px;
        transition: opacity 0.15s ease;
      }

      #${NOTICE_ID} button:hover {
        opacity: 0.82;
      }

      #${NOTICE_ID} button[data-action="restore"] {
        background: rgba(0, 66, 237, 1);
        color: #fff;
      }

      #${NOTICE_ID} button[data-action="remove"] {
        background: rgb(255 204 204);
        color: rgba(16, 24, 40, 1);
      }
    `;

    document.documentElement.appendChild(style);
  };

  injectStyles();

  storageGet(DRAFTS_ENABLED_STORAGE_KEY, false).then(setDraftsEnabled);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[DRAFTS_ENABLED_STORAGE_KEY]) return;
    setDraftsEnabled(Boolean(changes[DRAFTS_ENABLED_STORAGE_KEY].newValue));
  });

  const observer = new MutationObserver(() => {
    handleRouteChange();
    bindEditor();
    positionNotice();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', positionNotice);
  window.addEventListener('scroll', positionNotice, true);
})();
