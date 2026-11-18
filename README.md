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
- **Landmarks you know.** One World Trade Center, the Empire State Building
  (floodlit at night) and the Chrysler Building stand in the skyline scene. In
  Brooklyn, One World Trade and the Empire State rise over the rooftops beside
  downtown Brooklyn's own clock tower, the Williamsburgh Savings Bank.
- **Always moving.** Clouds drift, chimneys smoke, birds cross, and now and then
  an airliner goes over or a helicopter comes across.
- **Traffic.** Sedans, hatchbacks, SUVs, pickups, vans, a box truck, a city bus,
  sports cars and yellow cabs, in a spread of paints, parked and passing.
- **People.** A few are out at any time, usually three to five: someone alone,
  a couple, a dog pulling its walker toward a tree, a runner, a parent with a
  pram or a child, a kid on a skateboard, a kid bouncing a basketball. Cyclists
  and delivery riders pass in the road. People stop to look at a phone or let
  the dog sniff, then walk on. Now and then a group comes through, and there
  are never more than twenty. In Brooklyn they walk the pavement, passing
  behind the parked cars; over the skyline they come up onto the roofs to look
  at the view. Fewer are out at night. Everyone is dealt at random from a cast
  of 56 people and 8 dogs. The cast is a quarter East Asian, a quarter Black,
  a quarter brown and a quarter white, exactly, for every kind of character.
- **Doorsteps.** In Brooklyn people sit down on the stoops: someone alone, a
  couple, now and then a whole group that was passing. There is often somebody
  already sitting out when you open the scene.
- **Shops and signs.** A bodega, a bakery and a pizza place, each with its name
  on the sign, a word in neon in the window, goods on the shelves and a board
  out on the pavement. Street signs on the lamp posts, a bus stop, a no-parking
  plate. On the skyline's roofs, two billboards lit after dark.
- **Barbecues.** Now and then somebody has one on a roof: a string of lights
  goes up, a grill smokes, and people come up a few at a time. It lasts about
  an hour. They are decided by the clock rather than by chance at the moment,
  a handful a week between late morning and mid-evening, so one that is on is
  still on after a reload, and setting the time back finds it again.
- **Behind the windows.** In windows that are lit, somebody crosses a room or
  comes to look out; a cat settles on a sill; a dog gets its paws up. One room
  in fifty or so is lit red, blue, violet or green by an LED strip instead of a
  lamp.
- **Warning lights.** After dark about one building in eight carries a red
  light at its top, blinking out of step with the others.
- **More birds.** Besides the flock that crosses, ones, twos and small groups
  fly through while it is light.

## The look panel

Click the clock in the top-right corner. Everything applies as you move it and
is remembered in your browser.

| Control                 | What it does                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People                  | `out` or `none`. `none` empties the streets and roofs.                                                                                                                                                                                                         |
| Strength                | How strongly the scene shows, from full down to faint. Lower it when the picture competes with the text, above all with the wall hidden.                                                                                                                       |
| Message box colour      | The colour of the box you type in: six to choose from, or pick any. What you type turns light on a dark box.                                                                                                                                                   |
| Chat                    | `shown` or `hidden`. Hidden puts the chat, the sidebar and the title away so there is only the scene; the corner keeps the scene switch, the clock and a `show chat` button, and Esc brings everything back. The top bar has the same switch.                  |
| Sidebar width           | How wide the sessions sidebar is. The chat takes the room it leaves. You can also drag the sidebar's right edge.                                                                                                                                               |
| Time in Brooklyn        | Drag to set the scene to any time of day. **The clock cannot be paused:** it runs on from wherever you leave it. `now` snaps it back to the real time.                                                                                                         |
| Wall                    | `brick` or `none`. With `none` the wall goes away and the chat floats over the scene; its text then has its own colour (chalk to start with) and a stronger outline. The lightness slider makes the brick darker and grittier to the left, paler to the right. |
| Text size               | 80% to 150%. Scales all the type in the app.                                                                                                                                                                                                                   |
| Text colour on the wall | Six colours that sit well on brick, or pick any. The halo behind the letters turns dark when you pick a light colour, so text stays outlined.                                                                                                                  |

![ogchat conversation](docs/screens/03-conversation.png)

More screens: [first run](docs/screens/01-first-run.png) ·
[streaming](docs/screens/02-streaming.png) ·
[attaching files](docs/screens/07-attaching.png) ·
[inline error](docs/screens/04-inline-error.png) ·
[settings](docs/screens/05-settings.png) ·
[mobile](docs/screens/06-mobile.png) ·
[brooklyn](docs/screens/08-brooklyn.png) ·
[brooklyn at night](docs/screens/09-night.png) ·
[the look panel](docs/screens/10-look-panel.png) ·
[without the wall](docs/screens/11-no-wall.png) ·
[brooklyn with people, traffic and One World Trade](docs/screens/12-street-life.png) ·
[the skyline at night](docs/screens/13-skyline-night.png) ·
[the scene on its own, with a rooftop barbecue](docs/screens/14-scene-only.png) ·
[a chat in a project](docs/screens/15-project.png)

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
`/error`, `/empty`, `/slow` or `/drop` exercise the failure paths and `/think`
reasons before it answers. Every reply ends by reporting the thinking level,
system prompt and web search setting it was sent, and with web search on it
cites two made-up sources. The key `bad` is rejected as invalid (401), `broke`
is out of credits (402) and `nope` is refused (403).

## Provider configuration

Three values: API base URL, API key, model id. Set them in either place:

| Where          | How                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Settings panel | Gear button at the bottom of the sidebar. Saved to `data/settings.json`.                                                              |
| `.env.local`   | `cp .env.example .env.local`, then fill in `OGCHAT_API_BASE_URL`, `OGCHAT_API_KEY`, `OGCHAT_MODEL`. Restart the server after editing. |

Per field, the settings panel wins over `.env.local`, which wins over the
defaults:

- base URL `https://api.abliteration.ai/v1`
- model `abliterated-model-large-v2`

`abliterated-model-large-v2` is a reasoning model: it thinks before it answers
(the reply shows `thinking` until the answer starts) and it reads text only, so
attached images are refused by the provider. Text files and PDFs are fine,
because ogchat sends those as text.

### Thinking, web search and a system prompt

- **Thinking.** The `think` button by the message box steps through auto,
  medium, high and max; settings has the same choice, plus low. It is sent to
  the provider as `reasoning_effort`. Auto sends nothing. On
  `abliterated-model-large-v2` medium and high are the same level, and auto
  means max.
- **Web search.** The globe by the message box lets the next message search the
  web. The provider does the searching (`web_search_options` on the request)
  and the reply lists its sources. A message sent with it on is tagged `web`,
  and retrying that message searches again. On abliteration.ai, web search has
  to be switched on for the account first (console: Account, then Web tools)
  and is billed per search on top of tokens.
- **System prompt.** A box in settings. Whatever is in it goes ahead of every
  conversation as the system message, from the next message on. It is stored
  in `data/settings.json` with the other settings and is not part of any saved
  conversation.

### If the key does not work

Open settings and press **test**. It tries what is in the form, saved or not,
and reports each step: the key (by asking the provider for its model list),
the model id, and one tiny real message. Nothing is saved by testing. The
errors in the chat say the same things:

| Status | What it means                                                                     |
| ------ | --------------------------------------------------------------------------------- |
| 401    | The provider does not recognise the key. Copy the whole key again.                |
| 402    | The key is fine; the account has no credits left. Top up in the provider console. |
| 403    | The key may not use this model or project, or the request was blocked by policy.  |
| 404    | Wrong model id or base URL. The base URL ends in `/v1` for every model.           |

Two things to remember: a key saved in the settings panel wins over the one in
`.env.local`, and `.env.local` is only read when the server starts.

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
- **Projects** group sessions that share context. Pick one in the box under the
  search field (or `all chats`), start one with the `+` beside it, and open its
  panel with the button between them. A project has a name, instructions, and
  up to 20 files (text, PDFs, images, the same as on a message). In every chat
  filed under it, the instructions and the text of the files are sent ahead of
  the conversation, after your system prompt. Chats started while a project is
  selected are filed under it; the panel can also move the chat on screen in
  or out. Deleting a project keeps its chats.
- A session is saved on its first message, so "new session" never leaves empty
  entries behind.
- Hover the last message you sent to edit or delete it; hover the last reply to
  copy or retry it. Editing replaces the message and its reply, then asks again.
- Attach files with the paperclip, by dropping them on the chat, or by pasting
  (see below).
- Stopping keeps the text received so far, marked `— stopped`.
- A reply keeps generating on the server if you switch sessions or close the
  tab, and is there when you come back. Only Stop ends it early.
- Provider errors, an invalid key, an account out of credits, an empty reply
  and network loss all appear inline with a retry. Your message is saved before the provider is called, so
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
  sessions/<id>.json       one file per session: title, timestamps, messages, its project
  projects/<id>.json       one file per project: name, instructions, its files' details
  files/<owner>/<id>       attachments and project files: image bytes, or the text taken from a file
```

Back up or move the folder to keep your history. Delete it to start clean.

## Layout

```
src/
  app/
    page.tsx, layout.tsx           mounts the shell
    api/sessions/...               session + message routes (NDJSON streaming)
    api/projects/...               projects and their files
    api/settings/route.ts          provider settings (key masked)
  components/
    chat/                          the chat surface: transcript, composer, markdown
    shell/                         the app shell: sidebar, top bar, settings panel
  lib/
    provider/adapter.ts            the only module that talks to the provider
    daylight.ts                    sun, moon and clock over Brooklyn
    server/                        persistence, projects, settings, turn handling, request guard
    client/api.ts                  browser client for the routes above
tests/                             vitest: persistence, adapter, route contract, attachments, the clock, the people
scripts/mock-provider.mjs          stand-in provider for local trials
scripts/make-art.mjs, scripts/art/  generate the scenes, the sky, the people and the brick wall
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
    provider={{ ready: true, model: "abliterated-model-large-v2" }}
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
  - `scripts/art/people.mjs`: the cast. Each person and dog is dealt from
    lists of hat, coat and trouser colours at the top; `HERITAGE` holds the
    four equal parts the cast is dealt in, with the skin and hair of each;
    `CAST`, `RIDERS` and `DOGS` set how many of everyone there are.
  - `scripts/art/vehicles.mjs`: every kind of vehicle and the paints. The mix
    on the street is `PARKED` and `MOVING` in `brooklyn.mjs`.
  - `scripts/art/landmarks.mjs`: One World Trade, the Empire State and the
    Chrysler Building.
  - `scripts/art/street.mjs`: the lettering, shopfronts and what is in their
    windows, street signs and billboards. The shops themselves are listed in
    `brooklyn.mjs` (`shops`), the billboards in `skyline.mjs` (`boards`).
  - `scripts/art/extras.mjs`: the figures seen in windows, and the grill and
    lights for a barbecue.
- **The people:** `src/components/shell/life.ts` decides who turns up and what
  they do. `STREET_MIX` is how often each kind of party appears, `wantedHeads`
  how many people the street aims for (three to five by day), `MAX_HEADS` the
  ceiling (20). `StreetLife.tsx` holds how often groups come by. `SITS` is how
  likely each kind of party is to sit on a doorstep; `roofPartyAt` decides when
  there is a barbecue. `WindowLife.tsx` is who shows in the windows and
  `SkyTraffic.tsx` the aircraft and the birds.
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
scaled up: about 125 to 140 KB of a scene is on show at any one time, plus 86 KB
of shared sky and 76 KB for the wall, all served from your own machine. The
motion is plain CSS sliding and fading layers. There is no video and no canvas.
The only script is a clock that looks at the time every fifteen seconds and a
few timers that decide, once every second or few, whether somebody new should
walk in, a bird should cross or a figure should show at a window. Idle, that
measures at about 9 ms of script per ten seconds, with the people or without.
Everyone on screen is a tiny sprite that the browser slides and steps on its
own, and nothing new arrives while the tab is in the background. People who
set "reduce motion" in their system settings get the same scene, standing
still, with a few figures standing in it.

## API

| Route                                            | Purpose                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sessions?q=&project=`                  | List sessions, optionally filtered by text and by project (`project` is an id, or `none`)                                                                                                                                       |
| `POST /api/sessions`                             | Create a session, optionally in a project `{ projectId? }`                                                                                                                                                                      |
| `GET /api/sessions/:id`                          | Session with messages, plus `generating` / `partial`                                                                                                                                                                            |
| `PATCH /api/sessions/:id`                        | Rename `{ title }`, or file under a project `{ projectId }` (null takes it out)                                                                                                                                                 |
| `DELETE /api/sessions/:id`                       | Delete                                                                                                                                                                                                                          |
| `POST /api/sessions/:id/messages`                | Send `{ content, replaceFromMessageId?, web? }` or `{ regenerate: true }`; streams NDJSON events `start`, `thinking`, `delta`, `done` / `error`. With attachments, send `multipart/form-data` with the same fields plus `files` |
| `GET /api/sessions/:id/files/:fileId`            | An attachment: images as images, everything else as plain text                                                                                                                                                                  |
| `DELETE /api/sessions/:id/messages/:messageId`   | Delete a user message and everything after it                                                                                                                                                                                   |
| `POST /api/sessions/:id/stop`                    | Stop the reply in progress                                                                                                                                                                                                      |
| `GET` / `PUT /api/settings`                      | Read (masked) / update provider settings: `baseUrl`, `model`, `apiKey`, `reasoning`, `systemPrompt`                                                                                                                             |
| `POST /api/settings/test`                        | Try `{ baseUrl?, model?, apiKey? }` (or the current settings) against the provider without saving; returns `{ check }`                                                                                                          |
| `GET` / `POST /api/projects`                     | List projects (with instructions, files and session counts) / create one `{ name }`                                                                                                                                             |
| `GET` / `PATCH` / `DELETE /api/projects/:id`     | Read / update `{ name?, instructions? }` / delete a project. Its sessions are kept                                                                                                                                              |
| `POST /api/projects/:id/files`                   | Add files (`multipart/form-data`, field `files`)                                                                                                                                                                                |
| `GET` / `DELETE /api/projects/:id/files/:fileId` | A project file as the model receives it / remove it                                                                                                                                                                             |

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
