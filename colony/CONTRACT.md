# Mini Colony — interface contract

Mobile-first colony sim (RimWorld-lite) that runs as static files in a phone browser.
No build step, no external network assets, no libraries. Plain ES2020 scripts loaded with `<script src>`.

## File ownership (never edit a file you don't own)

| File | Owner |
|---|---|
| `colony/art.js` | Visual agent |
| `colony/style.css` | Visual agent |
| `colony/index.html` | Code agent |
| `colony/game.js` | Code agent |
| `colony/CONTRACT.md` | Lead only |

Load order in `index.html`: `style.css` in `<head>`, then `art.js`, then `game.js` at end of `<body>`.

## `window.Art` (defined in art.js)

All coordinates are CSS pixels. `ctx` is a 2D context already scaled for devicePixelRatio.
`px, py` = top-left of the tile; `size` = tile size in CSS px (roughly 28–40); `time` = ms since start (for animation).
Every draw function must be pure drawing (no game-state mutation) and must tolerate any `size`.

```
Art.init()                                   // sync; pre-render/cache whatever it wants. Called once before first frame and again after resize with Art.init(size).
Art.palette                                  // object of named colors the game may use for text/fx: { text, textShadow, good, bad, warn, gold, night }
Art.drawGround(ctx, px, py, size, variant)   // variant: integer 0..3, stable per tile
Art.drawObject(ctx, type, px, py, size, time)
    // type: 'tree' | 'rock' | 'bush' | 'bush_empty' | 'hut' | 'tower' | 'farm' | 'campfire'
    // objects may draw taller than the tile (overflow upward); game draws row by row top→bottom.
Art.drawColonist(ctx, c, px, py, size, time)
    // c = { name, trait, hp, maxHp, state, dir, look, carrying, selected }
    // state: 'idle' | 'walk' | 'work' | 'sleep' | 'fight' | 'dead'
    // dir: -1 (facing left) | 1 (facing right)
    // look: integer 0..7 (choose clothing/hair variant)
    // carrying: null | 'food' | 'wood' | 'stone'
    // selected: boolean (draw a ring)
    // Do NOT draw the name or hp bar; the game draws those.
Art.drawEnemy(ctx, kind, px, py, size, time, dir)   // kind: 'raider' | 'boar'
Art.drawHighlight(ctx, px, py, size, kind)          // kind: 'build-ok' | 'build-bad' | 'target'
Art.drawParticle(ctx, p)                            // p = { kind, x, y, life, maxLife } (x,y in CSS px; life counts down to 0)
    // kind: 'dust' | 'chip' | 'leaf' | 'spark' | 'smoke' | 'rain'
Art.drawSky(ctx, w, h, phase, weather, time)        // full-canvas overlay drawn LAST.
    // phase: 0..1 through the day (0 = dawn, 0.5 = dusk, 0.75 = midnight). weather: 'clear' | 'storm'
Art.icon(name)                                      // returns a data: URL (PNG) for UI <img>. Cache it.
    // name: 'food' | 'wood' | 'stone' | 'pop' | 'day' | 'morale' | 'hut' | 'tower' | 'farm'
    //       | 'speed' | 'pause' | 'play' | 'raid' | 'boar' | 'storm' | 'gift'
```

## CSS classes (defined in style.css, used by index.html)

Design for a 360–430px wide portrait phone; max content width 480px centred. Dark theme. Tap targets ≥ 44px.

```
body                         background + font
.app                         page column
.hud                         top bar: row of stats
.stat > img.stat-icon + span.stat-value
.morale > .morale-fill       morale bar; .morale-fill has style width:% and data-level="low|mid|high"
.stage > canvas              game board wrapper (rounded frame)
.panel                       a control row
.panel-label                 small caption above/left of a panel
.btn                         button; may contain img.btn-icon, span.btn-text, span.btn-cost
.btn.is-active               selected/toggled state
.btn:disabled                unaffordable
.log > .log-item[data-kind="good|bad|info|event"]   event log, newest first, may contain img.log-icon
.toast                       transient centred message over stage (game toggles .is-visible)
.overlay > .overlay-card     modal (game over / colonist info); overlay toggles .is-visible
.overlay-card h2, p, .btn    contents
.info-row                    key/value row inside overlay-card
```

## Game rules the art should expect (code agent implements)

- Grid 12 × 14 tiles, portrait.
- Colonists auto-pick jobs by a player-set priority (food / wood / stone / build), walk tile to tile with smooth interpolation, work at a resource, carry it back to the campfire (stockpile at map centre).
- Bushes become `bush_empty` after harvest and regrow. Trees/rocks disappear and respawn elsewhere.
- Buildings: hut (morale + pop cap), tower (defence), farm (slowly produces food).
- Single colony-wide morale value. Each colonist has exactly one trait.
- Day/night cycle; colonists sleep at night near huts/campfire.
- Random storyteller events: raid (raiders walk in from an edge), boar (steals food), storm, trader gift.
