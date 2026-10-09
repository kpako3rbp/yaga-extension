(() => {
  const DRAFTS_STORAGE_KEY = 'jagaDescriptionDrafts';
  const NOTICE_SELECTOR = '#jaga-description-draft-notice';
  const ATTRIBUTE_WRAPPER_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';
  const ATTRIBUTE_LABEL_SELECTOR = '[data-class="AttributeLabel_title"]';
  const EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';

  const storageGet = (key, fallback) =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [key]: fallback }, (result) => resolve(result[key]));
    });

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

  const isVisible = (element) => {
    if (!element?.isConnected || element.getClientRects().length === 0) return false;

    const styles = window.getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  };

  const getDescriptionEditor = () => {
    const wrappers = Array.from(document.querySelectorAll(ATTRIBUTE_WRAPPER_SELECTOR)).filter(
      (wrapper) => wrapper.querySelector(ATTRIBUTE_LABEL_SELECTOR)?.textContent?.trim() === 'Описание',
    );

    return wrappers.find(isVisible)?.querySelector(EDITOR_SELECTOR) ?? null;
  };

  const getDraftIdentity = () => {
    const taskCode = getTaskCode();
    const projectId = getProjectId();

    if (taskCode) {
      return {
        key: `task:${taskCode}`,
        taskKey: taskCode,
        projectId,
        isNew: false,
      };
    }

    if (!projectId || !getDescriptionEditor()) return null;

    return {
      key: `new:${projectId}`,
      taskKey: null,
      projectId,
      isNew: true,
    };
  };

  const isDraftForIdentity = (draft, identity) => {
    if (!draft || !identity || draft.key !== identity.key) return false;

    if (identity.isNew) {
      return draft.isNew === true && draft.projectId === identity.projectId;
    }

    return draft.isNew === false && draft.taskKey === identity.taskKey;
  };

  const sanitizeEditorHtml = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html;

    // Эти элементы ProseMirror добавляет только для отображения пустых строк.
    // Они не являются частью содержимого документа и не должны восстанавливаться как данные.
    template.content.querySelectorAll('br.ProseMirror-trailingBreak').forEach((element) => {
      element.remove();
    });

    template.content
      .querySelectorAll('.ProseMirror-separator, .ProseMirror-widget')
      .forEach((element) => element.remove());

    return template.innerHTML;
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
    const template = document.createElement('template');
    template.innerHTML = sanitizeEditorHtml(html);

    // Не используем execCommand('insertHTML'): при сложных списках браузер может
    // вставить весь фрагмент в текущий list-context и изменить структуру документа.
    // Полностью заменяем DOM редактора, сохраняя top-level структуру черновика.
    editor.replaceChildren(template.content.cloneNode(true));

    // ProseMirror наблюдает DOM редактора. InputEvent дополнительно сообщает ему,
    // что содержимое contenteditable изменилось.
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: null,
      }),
    );

    window.requestAnimationFrame(() => focusEditorAtEnd(editor));
  };

  document.addEventListener(
    'click',
    async (event) => {
      const button = event.target.closest(`${NOTICE_SELECTOR} [data-action="restore"]`);
      if (!button) return;

      // Не даём старому обработчику drafts.js выполнить execCommand('insertHTML').
      event.preventDefault();
      event.stopImmediatePropagation();

      const identity = getDraftIdentity();
      const editor = getDescriptionEditor();

      if (!identity || !editor) {
        document.querySelector(NOTICE_SELECTOR)?.remove();
        return;
      }

      const drafts = await storageGet(DRAFTS_STORAGE_KEY, []);
      const draft = Array.isArray(drafts)
        ? drafts.find((item) => isDraftForIdentity(item, identity))
        : null;

      if (!draft) {
        document.querySelector(NOTICE_SELECTOR)?.remove();
        return;
      }

      replaceEditorContent(editor, draft.html);
      document.querySelector(NOTICE_SELECTOR)?.remove();
    },
    true,
  );
})();
