# ogchat

A personal AI chat interface that runs entirely on your machine. Multi-session
chat with streaming replies, file attachments, local history, and one
configurable OpenAI-compatible provider. No accounts, no cloud, no telemetry.

The chat is written on an old wall of pixelated bricks where no two are alike:
mostly muted tan, with browns, greys, dull reds and limewashed pale ones, each
with its own peeling, discolouring and chipped corners. The rest of the
interface is see-through, over a pixel-art New York that keeps real time.

- **Two scenes**, switched from the top-right corner:
  - **skyline**: the harbour, the bridge and the towers.
  - **brooklyn**: a brownstone block somewhere between Prospect Heights,
    Bed-Stuy and Flatbush, with stoops, a corner bodega, apartment houses and a
    steeple behind, and Prospect Park's canopy and arch beyond.
- **A living clock.** The scene shows the actual time of day in Brooklyn. The
  sun rises on the left and sets on the right at the real times for the date,
  higher in summer than in winter; the sky moves through day, golden hour, dusk
  and night; stars come out and the moon shows its real phase.
- **Night lights.** Windows and street lamps come on as it gets dark, and their
  halos swell and settle on uneven rhythms, so the city shimmers.
- **Always moving.** Clouds drift, chimneys smoke, traffic passes, birds cross.

## The look panel

Click the clock in the top-right corner. Everything applies as you move it and
is remembered in your browser.

| Control                 | What it does                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Time in Brooklyn        | Drag to set the scene to any time of day. **The clock cannot be paused:** it runs on from wherever you leave it. `now` snaps it back to the real time. |
| Wall                    | Darker and grittier to the left, paler to the right.                                                                                                   |
| Text size               | 80% to 150%. Scales all the type in the app.                                                                                                           |
| Text colour on the wall | Six colours that sit well on brick, or pick any. The halo behind the letters turns dark when you pick a light colour, so text stays outlined.          |

![ogchat conversation](docs/screens/03-conversation.png)

More screens: [first run](docs/screens/01-first-run.png) ·
[streaming](docs/screens/02-streaming.png) ·
[attaching files](docs/screens/07-attaching.png) ·
[inline error](docs/screens/04-inline-error.png) ·
[settings](docs/screens/05-settings.png) ·
[mobile](docs/screens/06-mobile.png) ·
[brooklyn](docs/screens/08-brooklyn.png) ·
[brooklyn at night](docs/screens/09-night.png) ·
[the look panel](docs/screens/10-look-panel.png)

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000. With no key configured the app still works: the
empty state points you at settings. For a faster, production build:

```bash
npm run build
npm start
```

Both commands bind to 127.0.0.1 only.

### Try it without a real key

```bash
npm run mock-provider
```

This starts a stand-in provider at `http://127.0.0.1:8787/v1`. In settings, set
the base URL to that address and enter any key. Messages starting with
`/error`, `/empty`, `/slow` or `/drop` exercise the failure paths; the key
`bad` is rejected as invalid.

## Provider configuration

Three values: API base URL, API key, model id. Set them in either place:

| Where          | How                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Settings panel | Gear button at the bottom of the sidebar. Saved to `data/settings.json`.                                                              |
| `.env.local`   | `cp .env.example .env.local`, then fill in `OGCHAT_API_BASE_URL`, `OGCHAT_API_KEY`, `OGCHAT_MODEL`. Restart the server after editing. |

Per field, the settings panel wins over `.env.local`, which wins over the
defaults:

- base URL `https://api.abliteration.ai/v1`
- model `abliterated-model-large`

The provider must speak the OpenAI chat-completions shape:
`POST {base}/chat/completions` with `Authorization: Bearer <key>` and
`user` / `assistant` / `system` roles.

### Where the API key lives

- **Entered in the settings panel:** written to `data/settings.json` on this
  machine, in a file readable only by your user (mode 600).
- **From `.env.local`:** stays in that file and the server process. It is never
  copied into `data/`.
- Both `data/` and `.env.local` are gitignored. `.env.example` holds names only.
- The key never returns to the browser. The API reports it masked
  (`••••••••a1b2`), and the settings field is write-only.
- The key is never logged. Provider failures are logged with the masked form,
  and error text from the provider is scrubbed in case it echoes the key back.
- All provider calls are made by the server (`/api/...` routes); the browser
  talks only to ogchat.

## Using it

| Key                             | Action                                             |
| ------------------------------- | -------------------------------------------------- |
| Enter                           | Send                                               |
| Shift+Enter                     | Newline                                            |
| Esc                             | Stop the reply in progress                         |
| Cmd/Ctrl+K                      | Focus session search (Enter opens the first match) |
| Double-click or F2 on a session | Rename                                             |

- Sessions are titled from their first message and listed most recently active
  first. Search matches titles and message text.
- A session is saved on its first message, so "new session" never leaves empty
  entries behind.
- Hover the last message you sent to edit or delete it; hover the last reply to
  copy or retry it. Editing replaces the message and its reply, then asks again.
- Attach files with the paperclip, by dropping them on the chat, or by pasting
  (see below).
- Stopping keeps the text received so far, marked `— stopped`.
- A reply keeps generating on the server if you switch sessions or close the
  tab, and is there when you come back. Only Stop ends it early.
- Provider errors, an invalid key, an empty reply and network loss all appear
  inline with a retry. Your message is saved before the provider is called, so
  a failure never costs you the session.

## Attaching files

Up to 8 files per message, 20 MB each (8 MB for images).

| File                                                | How the model receives it                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Text of any kind (code, Markdown, CSV, JSON, logs…) | Inlined into your message as a labelled block. Works with every model.                                     |
| PDF                                                 | Its text is extracted and inlined the same way. Scanned PDFs with no text layer are refused.               |
| Images (PNG, JPEG, GIF, WebP)                       | Sent as an image part. This needs a model that can see; one that cannot will answer with a provider error. |

What a file is gets decided from its contents, not its name. Anything else
(archives, Office documents, audio…) is refused with a message, and your draft
and the other files stay in the composer. Text longer than 200,000 characters
per file is cut and marked as truncated.

Attachments stay part of the conversation: they are re-sent as context on every
later turn of that session, kept when you edit the message, and deleted from
disk when the message or session is deleted.

## Data

Everything is plain JSON under `data/` (override with `OGCHAT_DATA_DIR`):

```
data/
  settings.json            provider settings, including a key saved in the panel
  sessions/<id>.json       one file per session: title, timestamps, messages
  files/<session>/<id>     attachments: image bytes, or the text taken from a file
```

Back up or move the folder to keep your history. Delete it to start clean.

## Layout

```
src/
  app/
    page.tsx, layout.tsx           mounts the shell
    api/sessions/...               session + message routes (NDJSON streaming)
    api/settings/route.ts          provider settings (key masked)
  components/
    chat/                          the chat surface: transcript, composer, markdown
    shell/                         the app shell: sidebar, top bar, settings panel
  lib/
    provider/adapter.ts            the only module that talks to the provider
    daylight.ts                    sun, moon and clock over Brooklyn
    server/                        persistence, settings, turn handling, request guard
    client/api.ts                  browser client for the routes above
tests/                             vitest: persistence, adapter, route contract, attachments, the clock
scripts/mock-provider.mjs          stand-in provider for local trials
scripts/make-art.mjs, scripts/art/  generate the scenes, the sky and the brick wall
```

### Changing provider

All provider traffic goes through `src/lib/provider/adapter.ts`
(`streamChat`). A provider with a different wire format needs changes in that
file only; base URL and model are settings, never hardcoded at call sites.

### Embedding the chat surface

The chat surface and the app shell are separate. `ChatSurface` needs the API
routes and a parent with a height, nothing from the shell:

```tsx
import { ChatSurface } from "@/components/chat";

<div style={{ height: 600 }}>
  <ChatSurface
    sessionId={sessionId} // null starts a new conversation
    apiBase="/api" // where the ogchat routes are mounted
    provider={{ ready: true, model: "abliterated-model-large" }}
    onSessionCreated={(session) => setSessionId(session.id)}
  />
</div>;
```

Its styles are scoped to the `.ogchat` class; the design tokens (colors, fonts,
outlines) are CSS variables in `src/components/chat/theme.css`.

### Changing the look

Day to day, use the look panel (above). To change what it starts from:

- **Colors:** edit the variables at the top of `src/components/chat/theme.css`
  (ink, brick, the mud-brick red accent, muted green / blue / yellow).
- **Starting look:** `DEFAULT_LOOK` in `src/components/shell/look.ts` (scene,
  wall lightness, text size and colour), and the colour swatches beside it.
- **The art:** everything is drawn by code with no dependencies. Run
  `npm run art` after changing any of it to regenerate the PNGs under
  `src/components/*/art/`.
  - `scripts/art/bricks.mjs`: the wall. `LIGHTNESS` at the top sets the wall as
    built, from 0 (dark and gritty) to 1 (pale); the panel's slider adjusts
    around it. The brick colour families and how common each is come next; the
    kinds of wear are further down.
  - `scripts/art/sky.mjs`: the four skies, cloud tints, stars, sun and moon.
  - `scripts/art/skyline.mjs` and `brooklyn.mjs`: the scenes. Each is drawn
    once and turned out in four lights; `GRADES` near the top of each sets how
    the other three differ from the one it was drawn in.
- **The clock:** `src/lib/daylight.ts` works out where the sun and moon are
  over Brooklyn and which light the scene is in. `BROOKLYN` at the top holds
  the place; `skyBlend` holds the sun heights at which the light changes.
- **The motion:** `src/components/shell/Backdrop.tsx` and `backdrop.module.css`
  stack a scene's layers, crossfade them and move them. Speeds are the
  animation durations in that stylesheet, plus the cloud, traffic and bird
  timings each scene module sets.
- **Another scene:** add a module like `brooklyn.mjs` and register it in
  `scripts/make-art.mjs`. It then appears in the switch on its own.

### What the moving backdrop costs

Very little, by design. Every picture is small pixel art drawn at 640x360 and
scaled up: about 100 KB of a scene is on show at any one time, plus 85 KB of
shared sky and 76 KB for the wall, all served from your own machine. The motion
is plain CSS sliding and fading layers. There is no video and no canvas; the
only script is a clock that looks at the time every fifteen seconds. Idle, it
uses a few milliseconds of script per ten seconds, by day or by night. People
who set "reduce motion" in their system settings get the same scene, standing
still.

## API

| Route                                          | Purpose                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sessions?q=`                         | List sessions, optionally filtered                                                                                                                                                                            |
| `POST /api/sessions`                           | Create a session                                                                                                                                                                                              |
| `GET /api/sessions/:id`                        | Session with messages, plus `generating` / `partial`                                                                                                                                                          |
| `PATCH /api/sessions/:id`                      | Rename `{ title }`                                                                                                                                                                                            |
| `DELETE /api/sessions/:id`                     | Delete                                                                                                                                                                                                        |
| `POST /api/sessions/:id/messages`              | Send `{ content, replaceFromMessageId? }` or `{ regenerate: true }`; streams NDJSON events `start`, `delta`, `done` / `error`. With attachments, send `multipart/form-data` with the same fields plus `files` |
| `GET /api/sessions/:id/files/:fileId`          | An attachment: images as images, everything else as plain text                                                                                                                                                |
| `DELETE /api/sessions/:id/messages/:messageId` | Delete a user message and everything after it                                                                                                                                                                 |
| `POST /api/sessions/:id/stop`                  | Stop the reply in progress                                                                                                                                                                                    |
| `GET` / `PUT /api/settings`                    | Read (masked) / update provider settings                                                                                                                                                                      |

There is no login, so the API only answers requests addressed to a loopback
host and refuses state-changing requests from other origins. To serve ogchat
under another hostname, list it in `OGCHAT_ALLOWED_HOSTS` and pass your own
`-H` to `next dev` / `next start`. Do that only on a network you trust: anyone
who can reach the port can use your key.

## Development

```bash
npm run typecheck    # next typegen + tsc --noEmit
npm test             # vitest, provider stubbed, no network
npm run format       # prettier
npm run art          # regenerate the pixel art
```

Tests never touch the network: `fetch` is replaced with a stub provider, and
every test runs against its own temporary data directory.

Next.js' anonymous usage telemetry is switched off in `next.config.ts`.
