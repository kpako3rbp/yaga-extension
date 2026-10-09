# Jaga Comments Toggle

Расширение работает только на `https://jaga.rt.ru/*`.

В правом нижнем углу страницы автоматически появляется кнопка:

- когда комментарии видны — иконка с крестиком, кнопка скрывает комментарии;
- когда комментарии скрыты — иконка с галочкой, кнопка показывает комментарии.

При скрытии комментариев применяются только эти изменения:

```css
[data-class="EditCard_wrapper"] {
  flex-direction: column !important;
}

[data-class="EditCard_formColumn"] {
  width: 100% !important;
}

[data-class="EditCard_modulesColumn"] {
  display: none !important;
}
```

Дополнительно только у третьего по порядку элемента `[data-class="AttributeWrapper_wrapper"]` устанавливается:

```css
flex-direction: column !important;
```

При повторном нажатии все эти изменения отменяются.

## Установка

1. Распакуйте архив.
2. Откройте `chrome://extensions/` или `edge://extensions/`.
3. Включите «Режим разработчика».
4. Нажмите «Загрузить распакованное расширение».
5. Выберите папку `comments-layout-extension`.
6. Откройте или обновите страницу `https://jaga.rt.ru/`.
