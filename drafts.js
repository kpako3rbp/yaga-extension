(() => {
  const DRAFTS_STORAGE_KEY = 'jagaDescriptionDrafts';
  const DRAFTS_ENABLED_STORAGE_KEY = 'jagaDescriptionDraftsEnabled';
  const MAX_DRAFTS = 20;
  const SAVE_DELAY = 300;

  const ATTRIBUTE_WRAPPER_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';
  const ATTRIBUTE_LABEL_SELECTOR = '[data-class="AttributeLabel_title"]';
  const EDITOR_FIELD_SELECTOR = '[data-class="AttributeTextEditor_wrapper"]';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';

  const NOTICE_ID = 'jaga-description-draft-notice';
  const STYLE_ID = 'jaga-description-draft-styles';

  let draftsEnabled = false;
  let observedEditor = null;
  let observedEditorField = null;
  let editorFieldClickHandler = null;
  let inputHandler = null;
  let beforeInputHandler = null;
  let editorMutationObserver = null;
  let saveTimer = null;
  let noticeAnchor = null;
  let userHasEdited = false;
  let lastLocationKey = `${location.pathname}${location.search}`;
  let lastIdentityKey = null;

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

  const normalizeTaskCode = (value) => {
    const taskCode = value?.trim();
    if (!taskCode || !/^[\p{L}\d_-]+-\d+$/u.test(taskCode)) return null;
    return taskCode.toUpperCase();
  };

  const getTaskCode = () => {
    const queryTaskCode = normalizeTaskCode(new URLSearchParams(location.search).get('taskCode'));
    if (queryTaskCode) return queryTaskCode;

    const browseMatch = location.pathname.match(/^\/browse\/([^/?#]+)/);
    if (!browseMatch) return null;

    return normalizeTaskCode(decodeURIComponent(browseMatch[1]));
  };

  const getProjectId = () => {
    const pathMatch = location.pathname.match(/^\/project\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    const projectLink = document.querySelector('a[href^="/project/"]');
    const linkMatch = projectLink?.getAttribute('href')?.match(/^\/project\/(\d+)/);
    return linkMatch?.[1] ?? null;
  };

  const isNewTaskContext = () => {
    if (getTaskCode()) return false;

    const params = new URLSearchParams(location.search);
    const modal = params.get('modal')?.toLowerCase() ?? '';

    // В Яге создание задачи открывается отдельной task-модалкой.
    // Считаем форму новой задачей только при явном create/new-маркере,
    // а не просто потому, что в URL отсутствует taskCode.
    if (/create.*task|task.*create|new.*task|task.*new/.test(modal)) return true;

    return /^\/(?:create-task|new-task)(?:\/|$)/i.test(location.pathname);
  };

  const getDraftIdentity = () => {
    const taskCode = getTaskCode();

    if (taskCode) {
      return {
        key: `task:${taskCode}`,
        taskKey: taskCode,
        projectId: getProjectId(),
        isNew: false,
      };
    }

    if (!isNewTaskContext()) return null;

    const projectId = getProjectId();
    if (!projectId) return null;

    return {
      key: `new:${projectId}`,
      taskKey: null,
      projectId,
      isNew: true,
    };
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

  const getDrafts = async () => {
    const drafts = await storageGet(DRAFTS_STORAGE_KEY, []);
    return Array.isArray(drafts) ? drafts : [];
  };

  const setDrafts = async (drafts) => {
    const sortedDrafts = [...drafts]
      .filter((draft) => draft?.key && Number.isFinite(draft.updatedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DRAFTS);

    await storageSet({ [DRAFTS_STORAGE_KEY]: sortedDrafts });
  };

  const removeDraft = async (key) => {
    if (!key) return;
    const drafts = await getDrafts();
    await setDrafts(drafts.filter((draft) => draft.key !== key));
  };

  const saveDraft = async (editor) => {
    if (!draftsEnabled || !editor?.isConnected) return;

    const identity = getDraftIdentity();
    if (!identity) return;

    const drafts = await getDrafts();
    const nextDraft = {
      key: identity.key,
      taskKey: identity.taskKey,
      projectId: identity.projectId,
      isNew: identity.isNew,
      url: location.href,
      html: editor.innerHTML,
      text: editor.textContent?.trim() ?? '',
      updatedAt: Date.now(),
    };

    await setDrafts([nextDraft, ...drafts.filter((draft) => draft.key !== identity.key)]);
    lastIdentityKey = identity.key;
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
    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
    const width = Math.min(420, availableWidth, Math.max(300, rect.width));

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

  const restoreDraft = (draft) => {
    const identity = getDraftIdentity();
    const editor = getDescriptionEditor();

    // Последняя защита от вставки черновика другой задачи.
    if (!identity || draft.key !== identity.key || !editor) {
      removeNotice();
      return;
    }

    if (!replaceEditorContent(editor, draft.html)) return;

    removeNotice();

    window.requestAnimationFrame(() => {
      const currentEditor = getDescriptionEditor();
      if (!currentEditor) return;

      focusEditorAtEnd(currentEditor);
      userHasEdited = true;
      scheduleSave(currentEditor);
    });
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

    notice.addEventListener('pointerdown', (event) => event.preventDefault());

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

  const isDraftForIdentity = (draft, identity) => {
    if (!draft || !identity || draft.key !== identity.key) return false;

    if (identity.isNew) {
      return draft.isNew === true && draft.projectId === identity.projectId;
    }

    return draft.isNew === false && draft.taskKey === identity.taskKey;
  };

  const checkForRecoverableDraft = async () => {
    if (!draftsEnabled) return;

    const editorField = getDescriptionEditorField();
    const editor = getDescriptionEditor();
    const identity = getDraftIdentity();

    if (!editorField || !editor || !identity) {
      removeNotice();
      return;
    }

    const drafts = await getDrafts();
    const draft = drafts.find((item) => isDraftForIdentity(item, identity));

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

    if (observedEditor && beforeInputHandler) {
      observedEditor.removeEventListener('beforeinput', beforeInputHandler);
    }

    if (observedEditorField && editorFieldClickHandler) {
      observedEditorField.removeEventListener('click', editorFieldClickHandler, true);
    }

    editorMutationObserver?.disconnect();
    editorMutationObserver = null;
    observedEditor = null;
    observedEditorField = null;
    editorFieldClickHandler = null;
    inputHandler = null;
    beforeInputHandler = null;
    userHasEdited = false;
  };

  const bindEditor = () => {
    if (!draftsEnabled) return;

    const identity = getDraftIdentity();
    const editorField = identity ? getDescriptionEditorField() : null;
    const editor = identity ? getDescriptionEditor() : null;

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

    if (observedEditor || observedEditorField) {
      if (observedEditor && inputHandler) observedEditor.removeEventListener('input', inputHandler);
      if (observedEditor && beforeInputHandler) observedEditor.removeEventListener('beforeinput', beforeInputHandler);
      editorMutationObserver?.disconnect();
    }

    observedEditor = editor;
    inputHandler = null;
    beforeInputHandler = null;
    editorMutationObserver = null;
    userHasEdited = false;

    if (!editor) return;

    beforeInputHandler = (event) => {
      if (!event.isTrusted) return;
      userHasEdited = true;
      window.setTimeout(() => scheduleSave(editor), 0);
    };

    inputHandler = (event) => {
      if (!event.isTrusted) return;
      userHasEdited = true;
      scheduleSave(editor);
    };

    editor.addEventListener('beforeinput', beforeInputHandler);
    editor.addEventListener('input', inputHandler);

    editorMutationObserver = new MutationObserver(() => {
      if (userHasEdited) scheduleSave(editor);
    });

    editorMutationObserver.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const handleLocationChange = async () => {
    const locationKey = `${location.pathname}${location.search}`;
    if (locationKey === lastLocationKey) return;

    const previousIdentityKey = lastIdentityKey ?? getDraftIdentity()?.key ?? null;
    lastLocationKey = locationKey;

    removeNotice();
    unbindEditor();

    const currentIdentity = getDraftIdentity();

    // Если новая задача была успешно создана и появилась реальная taskCode,
    // временный new:<projectId> больше не нужен.
    if (previousIdentityKey?.startsWith('new:') && currentIdentity && !currentIdentity.isNew) {
      await removeDraft(previousIdentityKey);
    }

    lastIdentityKey = currentIdentity?.key ?? null;
    bindEditor();
  };

  const setDraftsEnabled = (enabled) => {
    draftsEnabled = Boolean(enabled);

    if (draftsEnabled) {
      lastIdentityKey = getDraftIdentity()?.key ?? null;
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

      @media (max-width: 420px) {
        #${NOTICE_ID} .jaga-draft__actions {
          grid-template-columns: 1fr;
        }
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
    handleLocationChange();
    bindEditor();
    positionNotice();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', handleLocationChange);
  window.addEventListener('resize', positionNotice);
  window.addEventListener('scroll', positionNotice, true);
})();
