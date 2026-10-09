(() => {
  const DRAFTS_STORAGE_KEY = 'jagaDescriptionDrafts';
  const NEW_TASK_SESSION_KEY = 'jagaNewTaskDraftId';
  const MAX_DRAFTS = 5;
  const SAVE_DELAY = 500;

  const ATTRIBUTE_WRAPPER_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';
  const ATTRIBUTE_LABEL_SELECTOR = '[data-class="AttributeLabel_title"]';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';
  const PREVIEW_SELECTOR = '[data-class^="TextEditorPreview_wrapper"]';
  const TASK_TITLE_SELECTOR = '[data-class="TaskTypeHeader_title_2"]';

  const NOTICE_ID = 'jaga-description-draft-notice';
  const STYLE_ID = 'jaga-description-draft-styles';

  let observedEditor = null;
  let inputHandler = null;
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

  const applyDraftToEditor = (wrapper, draft) => {
    const editor = wrapper.querySelector(EDITOR_SELECTOR);
    if (!editor) return false;

    editor.focus();
    editor.innerHTML = draft.html;

    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: null,
      }),
    );

    editor.dispatchEvent(new Event('change', { bubbles: true }));
    scheduleSave(editor);

    return true;
  };

  const restoreDraft = (draft) => {
    const wrapper = getDescriptionWrapper();
    if (!wrapper) return;

    const editor = wrapper.querySelector(EDITOR_SELECTOR);
    if (!editor) return;

    const preview = wrapper.querySelector(PREVIEW_SELECTOR);
    const editorContainer = editor.closest('[data-class="AttributeTextEditor__hidden_2"]');
    const editorIsHidden = editorContainer?.className?.includes('__hidden_') ?? false;

    if (editorIsHidden && preview) {
      preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    window.setTimeout(() => {
      const currentWrapper = getDescriptionWrapper();
      if (!currentWrapper) return;

      if (applyDraftToEditor(currentWrapper, draft)) {
        removeNotice();
      }
    }, editorIsHidden ? 100 : 0);
  };

  const showRecoveryNotice = (draft) => {
    if (document.getElementById(NOTICE_ID) || !document.body) return;

    const notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.innerHTML = `
      <div class="jaga-draft__content">
        <strong>Найден черновик описания</strong>
        <span>${escapeHtml(formatDraftTime(draft.updatedAt))}</span>
      </div>
      <div class="jaga-draft__actions">
        <button type="button" data-action="restore">Восстановить</button>
        <button type="button" data-action="remove">Удалить</button>
      </div>
    `;

    notice.querySelector('[data-action="restore"]').addEventListener('click', () => {
      restoreDraft(draft);
    });

    notice.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      await removeDraft(draft.key);
      removeNotice();
    });

    document.body.appendChild(notice);
  };

  const checkForRecoverableDraft = async () => {
    const editor = getDescriptionEditor();
    const identity = getDraftIdentity();

    if (!editor || !identity) {
      removeNotice();
      return;
    }

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

    showRecoveryNotice(draft);
  };

  const bindEditor = () => {
    const editor = getDescriptionEditor();

    if (editor === observedEditor) return;

    if (observedEditor && inputHandler) {
      observedEditor.removeEventListener('input', inputHandler);
    }

    observedEditor = editor;
    inputHandler = null;

    if (!editor) return;

    inputHandler = () => scheduleSave(editor);
    editor.addEventListener('input', inputHandler);

    checkForRecoverableDraft();
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
    bindEditor();
  };

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${NOTICE_ID} {
        position: fixed;
        right: 24px;
        bottom: 84px;
        z-index: 999999;
        width: 320px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #fff;
        border: 1px solid rgba(16, 24, 40, 0.12);
        border-radius: 12px;
        box-shadow: 0 10px 32px rgba(16, 24, 40, 0.18);
        color: rgba(16, 24, 40, 1);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        line-height: 18px;
      }

      #${NOTICE_ID} .jaga-draft__content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      #${NOTICE_ID} .jaga-draft__content span {
        color: rgba(131, 137, 151, 1);
      }

      #${NOTICE_ID} .jaga-draft__actions {
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
