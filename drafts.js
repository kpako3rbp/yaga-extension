(() => {
  const DRAFTS_STORAGE_KEY = 'jagaDescriptionDrafts';
  const NEW_TASK_SESSION_KEY = 'jagaNewTaskDraftId';
  const MAX_DRAFTS = 5;
  const SAVE_DELAY = 500;

  const ATTRIBUTE_WRAPPER_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';
  const ATTRIBUTE_LABEL_SELECTOR = '[data-class="AttributeLabel_title"]';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';
  const TASK_TITLE_SELECTOR = '[data-class="TaskTypeHeader_title_2"]';

  const NOTICE_ID = 'jaga-description-draft-notice';
  const STYLE_ID = 'jaga-description-draft-styles';

  let observedEditor = null;
  let observedWrapper = null;
  let inputHandler = null;
  let wrapperClickHandler = null;
  let saveTimer = null;
  let currentDraftKey = null;
  let lastPathname = location.pathname;

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

  const getDescriptionEditor = () => getDescriptionWrapper()?.querySelector(EDITOR_SELECTOR) ?? null;

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
      return {
        key: `task:${decodeURIComponent(existingTaskMatch[1])}`,
        taskKey: decodeURIComponent(existingTaskMatch[1]),
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
    const identity = getDraftIdentity();
    if (!identity || !editor?.isConnected) return;

    const html = editor.innerHTML;
    const text = editor.textContent?.trim() ?? '';

    if (!text && !html.replace(/<[^>]+>/g, '').trim()) {
      await removeDraft(identity.key);
      return;
    }

    const drafts = await getDrafts();
    const nextDraft = {
      key: identity.key,
      taskKey: identity.taskKey,
      isNew: identity.isNew,
      title: getTaskTitle(),
      url: location.href,
      html,
      text,
      updatedAt: Date.now(),
    };

    await setDrafts([nextDraft, ...drafts.filter((draft) => draft.key !== identity.key)]);
    currentDraftKey = identity.key;
  };

  const scheduleSave = (editor) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft(editor), SAVE_DELAY);
  };

  const formatDraftTime = (timestamp) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));

  const removeNotice = () => {
    document.getElementById(NOTICE_ID)?.remove();
  };

  const focusEditorAtEnd = (editor) => {
    editor.focus();

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const applyDraftToEditor = (wrapper, draft) => {
    const editor = wrapper.querySelector(EDITOR_SELECTOR);
    if (!editor) return false;

    editor.innerHTML = draft.html;

    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: null,
      }),
    );
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    focusEditorAtEnd(editor);
    scheduleSave(editor);

    return true;
  };

  const restoreDraft = (draft) => {
    const wrapper = getDescriptionWrapper();
    if (!wrapper) return;

    window.setTimeout(() => {
      const currentWrapper = getDescriptionWrapper();
      if (!currentWrapper) return;

      if (applyDraftToEditor(currentWrapper, draft)) {
        removeNotice();

        const editor = currentWrapper.querySelector(EDITOR_SELECTOR);
        if (editor) {
          window.requestAnimationFrame(() => focusEditorAtEnd(editor));
        }
      }
    }, 0);
  };

  const showRecoveryNotice = (draft, wrapper) => {
    if (document.getElementById(NOTICE_ID)) return;

    const notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.innerHTML = `
      <div class="jaga-draft__content">
        <strong>Найден черновик описания</strong>
        <span>Сохранён ${escapeHtml(formatDraftTime(draft.updatedAt))}</span>
      </div>
      <div class="jaga-draft__actions">
        <button type="button" data-action="restore">Восстановить</button>
        <button type="button" data-action="remove">Удалить</button>
      </div>
    `;

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

    wrapper.appendChild(notice);
  };

  const checkForRecoverableDraft = async () => {
    const wrapper = getDescriptionWrapper();
    const editor = getDescriptionEditor();
    const identity = getDraftIdentity();

    if (!wrapper || !editor || !identity) return;

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

    showRecoveryNotice(draft, wrapper);
  };

  const bindEditor = () => {
    const wrapper = getDescriptionWrapper();
    const editor = getDescriptionEditor();

    if (observedWrapper !== wrapper) {
      if (observedWrapper && wrapperClickHandler) {
        observedWrapper.removeEventListener('click', wrapperClickHandler, true);
      }

      observedWrapper = wrapper;
      wrapperClickHandler = null;

      if (wrapper) {
        wrapperClickHandler = () => {
          window.setTimeout(() => {
            bindEditor();
            checkForRecoverableDraft();
          }, 0);
        };

        wrapper.addEventListener('click', wrapperClickHandler, true);
      }
    }

    if (editor === observedEditor) return;

    if (observedEditor && inputHandler) {
      observedEditor.removeEventListener('input', inputHandler);
    }

    observedEditor = editor;
    inputHandler = null;

    if (!editor) return;

    inputHandler = () => scheduleSave(editor);
    editor.addEventListener('input', inputHandler);
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
    observedWrapper = null;
    bindEditor();
  };

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${NOTICE_ID} {
        width: min(100%, 420px);
        margin-top: 8px;
        padding: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: rgba(249, 250, 251, 1);
        border: 1px solid rgba(208, 212, 220, 1);
        border-radius: 8px;
        box-sizing: border-box;
        color: rgba(16, 24, 40, 1);
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

      #${NOTICE_ID} .jaga-draft__content span {
        color: rgba(131, 137, 151, 1);
      }

      #${NOTICE_ID} .jaga-draft__actions {
        flex-shrink: 0;
        display: flex;
        gap: 8px;
      }

      #${NOTICE_ID} button {
        min-height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
      }

      #${NOTICE_ID} button[data-action="restore"] {
        background: rgba(0, 66, 237, 1);
        color: #fff;
      }

      #${NOTICE_ID} button[data-action="remove"] {
        background: rgba(243, 244, 247, 1);
        color: rgba(16, 24, 40, 1);
      }
    `;

    document.documentElement.appendChild(style);
  };

  injectStyles();
  bindEditor();

  const observer = new MutationObserver(() => {
    handleRouteChange();
    bindEditor();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
