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
Current phase: 1 (skeleton pushed, build not yet checked)
Done: scope approved
Next: confirm the 0 to 1 test, then Phase 3 feature 1

## Handoff
Read SKILL.md first. Version line is shown on the main screen.

## Planned file tree
.github/workflows/build.yml, package.json, capacitor.config.json, www/index.html, www/style.css, www/app.js

## Known bugs
None yet

## Versions
versionName 1.0.0, versionCode 1 (set in android/app/build.gradle after the first build)
