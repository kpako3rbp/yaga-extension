(() => {
  const ROOT_CLASS = 'jaga-comments-hidden';
  const WIDGET_ID = 'jaga-comments-toggle-widget';
  const STYLE_ID = 'jaga-comments-toggle-styles';
  const STORAGE_KEY = 'jagaCommentsHidden';
  const ATTRIBUTE_SELECTOR = '[data-class="AttributeWrapper_wrapper"]';

  const ICON_HIDE = /*html*/ `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M13.593 19.855a9.96 9.96 0 0 1 -5.893 -.855l-4.7 1l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c2.128 1.816 3.053 4.363 2.693 6.813" />
      <path d="M22 22l-5 -5" />
      <path d="M17 22l5 -5" />
    </svg>
  `;

  const ICON_SHOW = /*html*/ `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M11.042 19.933a9.798 9.798 0 0 1 -3.342 -.933l-4.7 1l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c2.127 1.814 3.052 4.36 2.694 6.808" />
      <path d="M15 19l2 2l4 -4" />
    </svg>
  `;

  const isTaskPage = () => /^\/browse\/[^/?#]+/.test(location.pathname);

  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = /*css*/ `
    html.${ROOT_CLASS} [data-class="EditCard_wrapper"] {
      flex-direction: column !important;
    }

    html.${ROOT_CLASS} [data-class="EditCard_formColumn"] {
      width: 100% !important;
    }

    html.${ROOT_CLASS} [data-class="EditCard_modulesColumn"] {
      display: none !important;
    }

    html.${ROOT_CLASS} [data-class="TextEditorPreview_wrapper"] {
      max-height: fit-content !important;
    }

    html.${ROOT_CLASS} table {
      max-width: 100% !important;
    }

    #${WIDGET_ID} {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 999999;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: rgba(65, 129, 255, 1);
      color: #fff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
      cursor: pointer;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        background 0.15s ease;
    }

    html.${ROOT_CLASS} #${WIDGET_ID} {
      background: rgba(0, 66, 237, 1);
    }

    #${WIDGET_ID}:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
    }

    #${WIDGET_ID} svg {
      width: 24px;
      height: 24px;
      color: #fff;
      stroke: currentColor;
      pointer-events: none;
    }
  `;
  document.documentElement.appendChild(style);

  const button = document.createElement('button');
  button.id = WIDGET_ID;
  button.type = 'button';

  let commentsHidden = false;
  let modifiedAttributeWrapper = null;
  let previousFlexDirection = null;
  let previousFlexDirectionPriority = '';
  let lastPathname = location.pathname;

  const restoreThirdAttributeWrapper = () => {
    if (!modifiedAttributeWrapper) return;

    if (previousFlexDirection) {
      modifiedAttributeWrapper.style.setProperty(
        'flex-direction',
        previousFlexDirection,
        previousFlexDirectionPriority,
      );
    } else {
      modifiedAttributeWrapper.style.removeProperty('flex-direction');
    }

    modifiedAttributeWrapper = null;
    previousFlexDirection = null;
    previousFlexDirectionPriority = '';
  };

  const applyThirdAttributeWrapper = () => {
    const thirdAttributeWrapper = document.querySelectorAll(ATTRIBUTE_SELECTOR)[2];

    if (modifiedAttributeWrapper && modifiedAttributeWrapper !== thirdAttributeWrapper) {
      restoreThirdAttributeWrapper();
    }

    if (!commentsHidden || !thirdAttributeWrapper) return;
    if (modifiedAttributeWrapper === thirdAttributeWrapper) return;

    modifiedAttributeWrapper = thirdAttributeWrapper;
    previousFlexDirection = thirdAttributeWrapper.style.getPropertyValue('flex-direction');
    previousFlexDirectionPriority =
      thirdAttributeWrapper.style.getPropertyPriority('flex-direction');
    thirdAttributeWrapper.style.setProperty('flex-direction', 'column', 'important');
  };

  const renderButton = () => {
    button.innerHTML = commentsHidden ? ICON_SHOW : ICON_HIDE;
    button.setAttribute(
      'aria-label',
      commentsHidden ? 'Показать комментарии' : 'Скрыть комментарии',
    );
    button.setAttribute('title', commentsHidden ? 'Показать комментарии' : 'Скрыть комментарии');
    button.setAttribute('aria-pressed', String(commentsHidden));
  };

  const mountButton = () => {
    if (!isTaskPage() || !document.body || document.getElementById(WIDGET_ID)) return;
    document.body.appendChild(button);
  };

  const unmountButton = () => {
    document.getElementById(WIDGET_ID)?.remove();
  };

  const syncPageState = () => {
    if (!isTaskPage()) {
      document.documentElement.classList.remove(ROOT_CLASS);
      restoreThirdAttributeWrapper();
      unmountButton();
      return;
    }

    document.documentElement.classList.toggle(ROOT_CLASS, commentsHidden);

    if (commentsHidden) {
      applyThirdAttributeWrapper();
    } else {
      restoreThirdAttributeWrapper();
    }

    renderButton();
    mountButton();
  };

  const applyState = (hidden) => {
    commentsHidden = hidden;
    syncPageState();
  };

  chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
    applyState(Boolean(result[STORAGE_KEY]));
  });

  button.addEventListener('click', () => {
    const nextHidden = !commentsHidden;
    applyState(nextHidden);
    chrome.storage.local.set({ [STORAGE_KEY]: nextHidden });
  });

  const observer = new MutationObserver(() => {
    syncPageState();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.setInterval(() => {
    if (location.pathname === lastPathname) return;
    lastPathname = location.pathname;
    syncPageState();
  }, 500);

  window.addEventListener('popstate', syncPageState);

  if (document.body) {
    syncPageState();
  } else {
    document.addEventListener('DOMContentLoaded', syncPageState, { once: true });
  }
})();