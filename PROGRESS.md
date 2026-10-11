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
Current phase: 3, app shell redesign (4 screens, whole-page notes, settings) built, waiting for user test
Done: scope approved
Next: user tests the new shell, then AI chat page

## Handoff
Read SKILL.md first. Version line is shown on the main screen.

## Planned file tree
.github/workflows/build.yml, package.json, capacitor.config.json, www/index.html, www/style.css, www/app.js

## Known bugs
None yet

## Versions
versionName 1.3.0, versionCode 4 (android/app/build.gradle)

## Screens (updated for 1.3.0)
1. Notes manager: search, select and delete many, new note button, bottom navigation.
2. Note page: whole screen, typing and handwriting on the same page (ink layer over the text), tool dock in handwriting mode.
3. AI page: placeholder until the chat is built.
4. Settings: OpenRouter API key and model name, stored on the device only.
Files: www/core.js, www/ink.js, www/editor.js, www/app.js
