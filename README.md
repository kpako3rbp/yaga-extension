# Jaga Comments Toggle

Расширение работает только на `https://jaga.rt.ru/browse/*`.
В правом нижнем углу страницы автоматически появляется кнопка включения/выключения блока с комментариями.

## Что делает расширение
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

Дополнительно только у третьего по порядку элемента (секция с описанием задачи) `[data-class="AttributeWrapper_wrapper"]` устанавливается:

```css
flex-direction: column !important;
```

При повторном нажатии все эти изменения отменяются.

## Установка

1. Распакуйте архив `yaga-extension.zip` из свежего [релиза](https://github.com/kpako3rbp/yaga-extension/releases).
2. Откройте `chrome://extensions/`.
3. Включите «Режим разработчика».
4. Нажмите «Загрузить распакованное расширение».
5. Выберите папку `yaga-extension` из распакованного архива.
6. Откройте или обновите страницу `https://jaga.rt.ru/browse/TASK-123`.
