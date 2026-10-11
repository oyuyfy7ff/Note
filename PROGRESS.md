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
7. Images in a note: add, tap to select, drag to move, drag the corner dot to resize, tap the bin to delete.
   Done when: add 2 images, tap one, drag it to a new place, drag the corner dot to make it smaller, close and reopen the note, the place and size are kept.

## Status
Current phase: 3, image move and resize (1.6.0) built, waiting for user test
Done: scope approved, features 1 and 2 built, images in notes (1.5.0)
Next: user tests 1.6.0 (select, move, resize, delete, reopen), then AI chat page (feature 3, version 1.7.0)

## Handoff
Last worked by: Claude (Sonnet 5.5), 2026-10-11
Changed: www/editor.js (select, move, resize, delete for images), www/core.js (note.layout), www/ios.css (image controls), versions
Not tested: on the real phone (touch gestures, landscape)
Tested in desktop Chromium with a mouse: resize, move, reopen, delete.
Version line is shown on the settings screen.

## Planned file tree
.github/workflows/build.yml, package.json, capacitor.config.json, www/index.html, www/style.css, www/ios.css, www/core.js, www/images.js, www/ink.js, www/editor.js, www/app.js

## Known bugs
None yet

## Versions
versionName 1.6.0, versionCode 7 (android/app/build.gradle)

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

## Changes in 1.6.0
- Images can be moved and resized. Tap an image to select it: a bin button (top left) deletes it, a dot (bottom right) resizes it with the aspect ratio kept, dragging the image moves it. Tap outside to unselect. Position and size are saved in note.layout[id] = { x, y, w, ar } (x and w are fractions of the paper width, y is pixels, ar is height divided by width). Old images get a default place (full width, stacked) the first time the note is opened. Touch is turned off for gestures while handwriting mode is on.
