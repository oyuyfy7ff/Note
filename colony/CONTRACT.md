# Mini Colony v2 — interface contract

A RimWorld-like colony sim for phones, played in LANDSCAPE. Gameplay and UI layout should feel like RimWorld
(similar, not a copy), simplified for touch. Static files, no build step, no libraries, no network assets.
Plain ES2020 scripts loaded with `<script src>`. All player-facing text is Thai.

The art style of v1 is APPROVED by the player and must be kept: top-down 3/4 view, flat painted look, thick dark
outlines, muted earthy palette, light from top-left, every sprite casts a soft down-right shadow, rocks/buildings
show lit top + darker front face (depth/thickness).

## File ownership (never edit a file you don't own)

| File | Owner |
|---|---|
| `colony/art.js`, `colony/style.css` | Visual agent |
| `colony/index.html`, `colony/game.js` | Code agent |
| `colony/CONTRACT.md` | Lead only |

Load order: `style.css` in `<head>`; `art.js` then `game.js` at end of `<body>`.

## Screen & layout (landscape, RimWorld-like)

Target viewports: 667×375 (small) to 932×430 (large), plus tablets. Use `100dvh`, `env(safe-area-inset-*)`.
NOTHING may overflow the viewport; the page never scrolls; every button stays fully on screen at 667×375.
The game canvas fills the whole viewport behind the UI; UI floats over it:

```
┌───────────────────────────────────────────────────────────────┐
│ .resources (top-left,  .colonist-bar (top-centre portraits)  .clock + .speed (top-right) │
│  vertical list)                                                │
│                                                               │
│ .inspect (bottom-left panel for the selected thing)    .alerts (right side, stacked) │
│ .tabs (bottom bar, full width): สถาปนิก | งาน | คำสั่ง | โซน | ข้อมูล | เมนู         │
└───────────────────────────────────────────────────────────────┘
```
Opening a tab shows a `.tab-panel` that sits directly above `.tabs` (max ~55% of height, scrolls internally if needed).
When the device is portrait, show `.rotate-hint` full-screen ("กรุณาหมุนจอเป็นแนวนอน").

## `window.Art` (art.js)

Coordinates are CSS px; `ctx` is already scaled for DPR and camera zoom is applied by the game via `ctx.setTransform`
(so art just draws at `px,py` with tile size `size`; `size` ranges ~16–64 because of zoom). `time` = ms.
Pure drawing only. Must stay fast: ~1500 visible tiles + ~30 units at 30fps on a phone → cache per size.

```
Art.init(size)
Art.palette                  // { text, textShadow, good, bad, warn, gold, night, outline, panel, muted, hostile, select, draft }
Art.overflow                 // { [objectType]: tiles drawn above the tile top }

Art.drawGround(ctx, kind, px, py, size, variant)
    // kind: 'grass' | 'soil' | 'rich' (dark fertile soil) | 'sand' | 'gravel' ; variant 0..3
Art.drawMountain(ctx, px, py, size, mask, variant)
    // impassable mineable rock mass (RimWorld mountain). mask = 4-bit neighbours that are ALSO mountain
    // (1=N,2=E,4=S,8=W). Exposed edges show thick rock face/depth; interior is dark rock top.
Art.drawObject(ctx, type, px, py, size, time, opts)
    // type: 'tree' | 'rock' (small boulder) | 'bush' | 'bush_empty' | 'campfire' | 'bed' | 'turret' | 'torch'
    // opts: { variant, dir }  (bed has dir 0..3 = head facing N/E/S/W; bed is 1 tile)
Art.drawWall(ctx, material, px, py, size, mask)
    // material: 'wood' | 'stone'; mask like drawMountain (neighbours that are wall or door). Walls have thickness + top cap.
Art.drawDoor(ctx, material, px, py, size, open, vertical)   // open: 0..1 animation; vertical: true if walls are N/S of it
Art.drawCrop(ctx, kind, px, py, size, growth, time)          // kind: 'rice' | 'berry'; growth 0..1 (1 = harvestable)
Art.drawZone(ctx, kind, px, py, size, mask)                  // kind: 'grow' (green tint) | 'stockpile' (grey/blue tint); mask = same-zone neighbours, draw border only on outer edges
Art.drawItem(ctx, kind, px, py, size, count)                 // item stack lying on ground; kind: 'wood' | 'stone' | 'berries' | 'rice' | 'meal'; show count small
Art.drawBlueprint(ctx, type, px, py, size, progress, mask)   // RimWorld blue ghost; type: 'wall_wood'|'wall_stone'|'door_wood'|'bed'|'turret'|'campfire'|'torch'; progress 0..1 (frame fills in)
Art.drawDesignation(ctx, kind, px, py, size)                 // small icon marker on the tile: 'chop' | 'mine' | 'harvest' | 'deconstruct'
Art.drawColonist(ctx, c, px, py, size, time)
    // c = { state, dir, look, carrying, selected, drafted }
    // state: 'idle'|'walk'|'work'|'sleep'|'fight'|'shoot'|'eat'|'dead'|'downed'; dir -1|1; look 0..7
    // carrying: null | item kind; drafted: draw a small marker/stance
Art.drawEnemy(ctx, kind, px, py, size, time, dir, state)     // kind: 'raider' | 'boar'; state as colonist
Art.drawProjectile(ctx, p)                                   // p = { x, y, dx, dy } in px; small bullet/arrow streak
Art.drawSelection(ctx, px, py, w, h)                         // RimWorld corner brackets around a rect (px)
Art.drawDragRect(ctx, x, y, w, h, kind)                      // rectangle being dragged; kind: 'designate'|'zone'|'cancel'|'build'
Art.drawHighlight(ctx, px, py, size, kind)                   // 'build-ok' | 'build-bad' | 'target' | 'move'
Art.drawParticle(ctx, p)                                     // kinds: 'dust' | 'chip' | 'leaf' | 'spark' | 'smoke' | 'rain' | 'blood'
Art.drawSky(ctx, w, h, phase, weather, time)                 // screen-space overlay (game resets transform first). weather 'clear'|'storm'
Art.icon(name)                                               // cached data: URL PNG for UI <img>
    // resources/UI: 'food','wood','stone','rice','berries','meal','pop','day','morale','speed','pause','play','fast','faster'
    // tabs: 'architect','work','orders','zones','info','menu'
    // build/orders/zones: 'wall_wood','wall_stone','door_wood','bed','turret','campfire','torch',
    //                     'chop','mine','harvest','cancel','deconstruct','zone_grow','zone_stockpile','zone_remove'
    // misc: 'draft','undraft','raid','boar','storm','gift','wanderer','alert','close'
Art.portrait(look)                                           // cached data: URL of the colonist's head/shoulders for the colonist bar
```

## CSS classes (style.css) used by index.html

```
body, .game (fixed full-viewport root), canvas.world (full-viewport)
.resources > .res-row > img.res-icon + span.res-value            (top-left, compact, translucent like RimWorld)
.colonist-bar > .colonist-card[.is-selected][.is-drafted][.is-down] > img.portrait + .bar-mini > .bar-fill + span.name
.clock (day / time / season text) ; .speed > .btn-speed[.is-active] > img
.inspect[.is-visible] > .inspect-title, .inspect-body, .need-row > span + .need-bar > .need-fill[data-level="low|mid|high"], .inspect-actions > .btn
.alerts > .alert[data-kind="bad|warn|info"] > img + span        (RimWorld right-side alert list)
.tabs > .tab[.is-active] > img + span
.tab-panel[.is-visible] > .panel-title, .panel-grid > .tool[.is-active][disabled] > img + span.tool-name + span.tool-cost
.work-table (table) th, td, .prio[data-p="0|1|2|3|4"] (tap cycles; 0 = blank/off)
.log > .log-item[data-kind]                                        (inside the ข้อมูล tab panel)
.toast[.is-visible]  (top-centre letter like RimWorld's event letter)
.letter-overlay[.is-visible] > .letter (event letter with title + body + .btn)
.rotate-hint
.btn, .btn.is-active, .btn:disabled
```
All tap targets ≥ 40px tall at 667×375. Compact fonts (12–14px) like RimWorld but readable.

## Gameplay (code agent implements)

- Map 48×32 tiles: grass/soil/rich soil/sand patches, a mountain mass on one side (mineable → stone chunks),
  trees, boulders, berry bushes. Camera: one-finger drag pans, pinch zooms (and mouse wheel/drag on desktop).
  Tap selects. Long-press or double-tap a selected drafted colonist's destination = move.
- Colonists (start 3), each with ONE trait, hp, needs: food & rest (two bars). NO per-colonist mood; one colony
  morale value (beds, food, deaths, events).
- Work types (RimWorld "Work" tab, per-colonist priority 1–4 or off): ก่อสร้าง, ปลูก, ขุด, ตัดไม้, ขนของ, ทำอาหาร.
  Colonists pick the highest-priority available job (ties by distance).
- Orders tab (drag a rectangle): ตัดไม้ (chop), ขุด (mine mountain/boulders), เก็บเกี่ยว (berries/crops), รื้อถอน, ยกเลิก.
- Zones tab (drag): พื้นที่ปลูก (grow zone: colonists sow rice, it grows over days, harvest → rice items),
  คลังเก็บ (stockpile: haulers carry items there), ลบโซน.
- Architect tab: กำแพงไม้, กำแพงหิน, ประตูไม้, เตียง, ป้อมปืน (turret, auto-shoots enemies), กองไฟ (cook raw food → meal), คบเพลิง.
  Placing makes blueprints (drag for walls); builders haul materials then build over time.
- Items are physical stacks on tiles; resource readout counts items in stockpiles (like RimWorld).
- Food: colonists eat meals > raw food; raw food can be cooked at campfire by cooks (ทำอาหาร).
- Rest: sleep in own bed (assigned automatically) or on the ground (morale penalty).
- Combat: draft button in inspect panel / colonist bar; drafted colonists stop working, move where ordered,
  auto-shoot enemies in range. Undrafted colonists flee raiders. Downed at low hp; can die.
- Day/night, storyteller events (none in first 2 days): raid, manhunter boar, storm, trader drop gift,
  wanderer joins. Each shows a RimWorld-style letter + alert + log entry.
- Speed: pause / 1× / 2× / 3×. Autosave to localStorage (try/catch everywhere) + "เกมใหม่" in เมนู.
