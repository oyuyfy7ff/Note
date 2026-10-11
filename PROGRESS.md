# Progress

## Scope
App: NoteMind, notes app with AI (OpenRouter). Stack: Capacitor.
App id: com.g.notemind
Platforms: Android only (iOS: no)
Look: hue 265, sat 1, soft (light and dark follow the phone)
Features and "Done when":
1. Typed note: create, type, save; close and reopen, the note is still there.
2. Handwritten note: draw on a page, choose color and thickness, erase, undo, save.
3. AI chat page (OpenRouter): type a question and get an answer; buttons for summarize, analyze, search my notes.
4. Cut menu: drag a box over part of a note and send it to the chat, or copy text into the chat (handwriting goes as an image, needs a vision model).
5. Settings: OpenRouter API key and model name typed by the user, stored on the device only.
6. Practice questions: AI makes questions from a note; user can import images and files into a note or the chat.

## Status
Current phase: 3, images in notes (1.5.0) built, waiting for user test
Done: scope approved
Next: user tests 1.5.0 (add, view and delete images), then AI chat page

## Handoff
Read SKILL.md first. Version line is shown on the main screen.

## Planned file tree
.github/workflows/build.yml, package.json, capacitor.config.json, www/index.html, www/style.css, www/app.js

## Known bugs
None yet

## Versions
versionName 1.5.0, versionCode 6 (android/app/build.gradle)

## Screens (updated for 1.3.0)
1. Notes manager: search, select and delete many, new note button, bottom navigation.
2. Note page: whole screen, typing and handwriting on the same page (ink layer over the text), tool dock in handwriting mode.
3. AI page: placeholder until the chat is built.
4. Settings: OpenRouter API key and model name, stored on the device only.
Files: www/core.js, www/ink.js, www/editor.js, www/app.js

## Changes in 1.4.0
- Look: iOS Notes style (grouped lists, yellow accent, large titles, tab bar with line icons). New file www/ios.css loads after style.css.
- Note page: fixed full-screen view, the paper scrolls inside it, floating tool pill that takes no paper space, slim bars in landscape.

## Changes in 1.5.0
- Images in notes: image button in the note top bar (several at once, shrunk to 1600 px), shown under the title, tap to delete, ink draws over them. New file www/images.js keeps the pictures in IndexedDB (ids are saved in note.images). Deleting a note deletes its pictures.
