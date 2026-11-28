# ogchat

A personal AI chat interface that runs entirely on your machine. Multi-session
chat with streaming replies, file attachments, local history, and one
configurable provider: any OpenAI-compatible one, or Claude on your own
Anthropic API key, which can also [work on a GitHub repository](#claude-and-a-github-repository)
you point it at and, if you allow it, [run code](#letting-claude-run-code). No accounts, no cloud, no telemetry.
Besides your provider it talks to a public weather service, if you leave that
on, asked what the weather is in New York (see
[Weather](#the-weather-is-new-yorks)); and to GitHub, only if you give it a
token and tie a repository to a project.

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
  halos swell and settle on uneven rhythms, so the city shimmers. Here and
  there a light is switched on or off: one window at a time, about every half
  minute, never several together.
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
  out on the pavement. No two are lettered alike: small capitals, a
  hand-lettered lower case, chunky block capitals, and tall narrow ones on the
  hotel's roof sign. A street sign on a lamp post, a bus stop, a no-parking
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
- **Cabs.** Every few minutes somebody walks to an empty stretch of kerb, puts
  an arm up, and a yellow cab pulls in, takes them and drives off.
- **Warning lights.** After dark about one building in eight carries a red
  light at its top, a single pixel, blinking out of step with the others.
- **Seasons.** The scene follows the calendar in Brooklyn. In spring the trees
  are in fresh leaf and blossom, with petals on the pavement; in summer they
  are full and dark; in autumn they turn and drop their leaves along the kerb,
  and a few come down on the wind; in winter they are bare. Snow lies only
  when it is lying in New York: then it is on the roofs and cornices, the
  stoops, the parked cars and the pavement, and on the skyline's roofs.
- **A street that keeps New York's hours.** How many people are out follows
  the clock and the calendar: almost nobody at four in the morning, a rush
  to school and the subway, a lull while everyone is at work, lunch, school
  letting out, and the walk home, which is the busiest it gets. Days off
  start late, fill the afternoon and run later at night; Friday night runs
  late and Sunday night does not. The cold thins it out (it goes by New
  York's real temperature when the weather is live), and so do heat, rain
  and snow. After half past nine at night there are no children, prams or
  ball games; below about 9°C nobody sits out on a doorstep, and nobody
  barbecues in a coat.
- **Traffic keeps the same hours.** The road is full at the two rush hours,
  steady through the day, and down to the odd car at three in the morning;
  days off have no rush and more about after midnight. Cars join and leave
  the road off the edge of the picture, never in view. Few flights come over
  after midnight.
- **Every window is somebody's.** No window is lit in the pictures. The scene
  decides which are, from who is behind each one, and no two nights are the
  same. An office floor is lit while it is staffed and empties between six
  and nine, a floor at a time; the odd window stays on for somebody working
  late; the lobby stays lit; on working nights the cleaners go up each tower
  floor by floor, and at the weekend most of it never comes on. Flats light
  up as it gets dark and people get home, and go dark as they go to bed:
  most around eleven, later before a day off, a few night owls, one or two
  up all night, the early risers before dawn, and now and then a light for
  ten minutes at four in the morning. On a November afternoon the towers
  are blazing at five; in June they have emptied before it is dark.
- **No lights at midday.** A lit window shows only when it is dark enough
  out to see it: nothing at noon, more as the sun goes down, and under a
  heavy storm sky some come on in the afternoon. Shop windows by day are
  glass you can see into, not lamps.
- **The rest of the street.** Now and then, and not often: somebody pushing
  a cart heaped with bags of cans to the redemption centre; somebody asleep
  on a doorstep with their things beside them, more often at night;
  somebody walking up and down, stopping to hold forth to nobody. A police
  car comes down the block a couple of times an hour at most, and one time
  in five it is on a call, lights going, and gone in seconds.
- **Dressed for the weather.** Everybody has three wardrobes and wears the
  one the temperature calls for: coats, hats and scarves under 9°C, shorts
  and bare arms from 24°C. When it rains the umbrellas go up, more of them
  the harder it comes down. Whoever was out before the weather turned stays
  as they were dressed.
- **Shop hours.** The bodega never shuts. The bakery opens before dawn and
  has its shutters down by seven; the pizza place opens for lunch and goes
  on past midnight, till three on Friday and Saturday nights.
- **Wet streets and deep snow.** While it rains, and for most of an hour
  after, the pavement and the road are dark and show the lamps and shop
  windows upside down in them. When the snow lying in New York is more than
  about ten centimetres, there are ploughed banks along the kerb.
- **The block's routine.** Rubbish goes out at the kerb on Monday and
  Thursday evenings and the sanitation truck takes it, pile by pile, a
  little after six the next morning. On those two mornings the kerb is
  empty from nine to half past ten for the street sweeper, which comes
  through. The school bus stops twice on a school day and lets children off
  in the afternoon. The letter carrier walks the block door to door around
  midday. A parcel van double-parks with its hazards on a few times a day,
  more in December, while the driver goes up somebody's steps. On warm dry
  summer afternoons the ice cream truck pulls up and children come to it.
  At lunch and dinner there are couriers on electric bikes.
- **The calendar.** Christmas lights along the cornices from the first of
  December to Epiphany. Pumpkins on the steps for the three weeks to
  Halloween, the carved ones lit after dark. Fireworks over the skyline at
  half past nine on the Fourth of July, and at midnight on New Year's.
- **The wind is New York's too.** Rain slants the way the real wind blows
  and as hard; snow and leaves are carried further by it.
- **The small things.** Pigeons on the pavement by day. A squirrel going
  from tree to tree. A rat along the kerb at night. Steam through the
  manholes when it is under 7°C.
- **Sound, if you want it.** Off to begin with; the look panel turns it on.
  A hum of traffic that follows the hour, cars going by, rain, wind, birds
  in the morning, thunder in a storm, and every several minutes a siren a
  long way off. A police car on a call can be heard, and so can fireworks.
  All of it is made on the spot from noise and a few oscillators: there are
  no recordings in ogchat.
- **Weather.** New York's own, live: what is over the city right now is
  what is over the scene, looked at again every ten minutes. Clear, broken
  cloud, overcast, drizzle, rain, a downpour, thunder, fog, flurries, snow.
  The sky is as covered as the real one, so the sun, moon and stars show or
  hide with it; rain and snow thin out the people on the street and call off
  the barbecues. More under [Weather](#the-weather-is-new-yorks).
- **Any day since 1 January 2025.** Set the scene to a past day and it shows
  that day: its season, its sun and moon, and the weather New York had, hour
  by hour, at the time of day your clock reads.
- **Wear and tear, in real time.** The street ages at the speed a real one
  does. Each scene has some hundreds of small marks waiting (a streak under a
  window sill, a crack across the pavement, a patch in the road, a chipped
  kerb, a sticker on a lamp post, a scribble of paint) and each has its day,
  spread over twenty years from the day your street was first opened. That is
  a new mark every week or so: nothing to watch for, and a different street
  in a few years. The look panel can show you what is coming.
- **More birds.** Besides the flock that crosses, ones, twos and small groups
  fly through while it is light.

## The weather is New York's

With the weather set to `New York, live` (it is, to begin with), ogchat's
server asks [Open-Meteo](https://open-meteo.com), a public weather service
that needs no account and no key, what the weather is at one fixed point in
Brooklyn. It asks at most once every ten minutes while a window is open, and
the scene shows the answer: the kind of weather, how hard it is coming down,
how much of the sky is covered, whether snow is lying.

Set the **day** in the look panel to any date back to 1 January 2025 and the
scene shows that day instead, at the time of day your clock reads: its
season, its sun and moon, and the weather New York had that hour. A past
day is asked for once and then kept in `data/weather/`, so going back to it
needs no network. It comes from the service's record of what its weather
models had for that day, and failing that from its reanalysis archive; both
are reconstructions on a grid of a few kilometres, good for "it snowed that
morning", not a weather station's log.

What this means for privacy, since it is the one thing besides your provider
that ogchat reaches out to:

- The request carries the coordinates of that point in Brooklyn and the list
  of figures wanted. Nothing of yours is in it: no chats, no key, no name,
  no location of your own. Like any request, it comes from your IP address.
- It is made by ogchat's server on your machine, not by the page.
- Set the weather to `made up (asks nobody)`, or hold it to one kind, and
  nothing is asked at all. Made-up weather goes by the clock and the season,
  so it still holds for hours and survives a reload.
- If the service cannot be reached, the scene carries on with made-up
  weather, says so in the look panel, and asks again later.

Weather data by [Open-Meteo.com](https://open-meteo.com). Its free service
is offered for non-commercial use and asks for that credit; its terms are on
its site.

For trials without the network, `node scripts/mock-weather.mjs` is a
stand-in, used by starting ogchat with
`OGCHAT_WEATHER_URL=http://127.0.0.1:8788`.

## The look panel

Click the clock in the top-right corner. Everything applies as you move it and
is remembered in your browser.

| Control                 | What it does                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People                  | `out` or `none`. `none` empties the streets and roofs.                                                                                                                                                                                                         |
| Motion                  | `live` or `frozen`. Frozen holds the scene still, like a picture, while you work: nothing moves and nobody arrives. The light still follows the clock.                                                                                                         |
| Sound                   | `off`, or `on` with a volume: the street, heard. Made on the spot; nothing is played back. It starts on your click, as browsers require.                                                                                                                       |
| Day                     | Today, or any day back to 1 January 2025. On a past day the scene keeps your time of day and shows that day's season, sky and weather. `today` brings it back.                                                                                                 |
| Season                  | `by the calendar`, or hold the scene to spring, summer, autumn or winter, or to `winter, snowed in`.                                                                                                                                                           |
| Weather                 | `New York, live` (on a past day, `New York, that day`), `made up (asks nobody)`, or hold it to one kind. Underneath it says what New York is doing: "light rain · 48°F (9°C) · wind 9 mph · as of 2:15 pm".                                                    |
| Wear                    | How old your street is, and a slider to look ahead at the wear to come, up to twenty years. Looking ahead is not remembered: reload and the street is its real age again.                                                                                      |
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
[a chat in a project](docs/screens/15-project.png) ·
[winter, snowing](docs/screens/16-winter-snow.png) ·
[autumn rain](docs/screens/17-autumn-rain.png) ·
[thinking, shown as it is written](docs/screens/18-thinking.png) ·
[a past day: 6 January 2025, snowing](docs/screens/19-past-day.png) ·
[rain under a grey sky](docs/screens/20-live-rain.png)

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

### As an app of its own

ogchat is a local web app: a small server on your machine and a page that
talks to it. It can still live outside your browser, in a window of its own
with its own Dock icon. Three ways, the first being the real thing:

- **A Mac app.** On the Mac, in the project folder:

  ```bash
  npm run mac
  ```

  This downloads Electron (once, about 100 MB), builds `ogchat.app` into
  `dist-app/` and signs it for this Mac. Open it from there or drag it into
  Applications. The app is a thin shell around the project where it lives: on
  launch it builds the project if it has changed, starts ogchat's server on a
  port of its own (3311), and shows it;
  quitting the app stops the server. Your chats, settings and key stay where
  they are, in the project's `data/` and `.env.local`, so the app and the
  browser see the same conversations. Updating the project updates what the app shows, the next time it is
  opened. The app itself (its icon, and the small launcher inside it) is only
  remade by running `npm run mac` again and replacing the copy in
  Applications; that is also what to do after moving the project folder. The
  server runs under the Node the app was built with, so nothing extra shows in
  the Dock while it runs; if that Node has since gone, the app falls back to
  the runtime inside itself. The look
  panel's choices are kept per window: the app remembers its own, separately
  from your browser's. `npm run desktop` runs the same window without building
  an app.

- **Double-click `scripts/ogchat.command`** in Finder (or `npm run app`). It
  starts the server if it is not running, builds first if the app has been
  updated, and opens ogchat in a window with no tabs or address bar (using
  Chrome, Brave, Edge or Arc if one is installed; otherwise your default
  browser). A Terminal window stays open while it runs; closing it stops
  ogchat. The first time, macOS may ask you to confirm opening it: right-click
  the file and choose Open.
- **Install it from the browser** while the server is running. In Chrome: the
  install icon at the right of the address bar, or the menu, then Cast, save
  and share, then Install page as app. In Safari: File, then Add to Dock. The
  installed app opens ogchat in its own window, but something still has to
  start the server (the launcher above, or `npm run dev`).

Either way your chats and settings are the same ones: they live in `data/` and
in the browser's storage for `127.0.0.1:3000`.

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

### Try Claude without a key

```bash
node scripts/mock-claude.mjs
```

```bash
OGCHAT_ANTHROPIC_URL=http://127.0.0.1:8789 OGCHAT_GITHUB_URL=http://127.0.0.1:8789 npm run dev
```

A stand-in for both the Claude API and GitHub. Switch the provider to Claude,
enter any key and any token, and tie any `owner/name` to a project: Claude
"looks" at a two-file repository and answers.

## Provider configuration

The settings panel starts with a switch: **any provider** (the OpenAI-shaped
one described below) or **claude**. Each keeps its own key and model, so you
can go back and forth.

### Claude, on your own API credit

1. Make a key at [platform.claude.com](https://platform.claude.com) (API keys). It
   starts `sk-ant-`. API credit is separate from a Claude subscription.
2. In settings choose **claude**, paste the key, pick a model, press **test**
   (it asks Anthropic whether the key can use that model, which costs nothing),
   then **save**.

Or put `ANTHROPIC_API_KEY=...` in `.env.local` instead of the settings panel.

If the test says the key is "not scoped to a workspace", the key covers every
workspace of your account and Anthropic wants to know which one to use. Copy
the workspace's id (it starts `wrkspc_`) from the Claude Console under
Workspaces and paste it into **Workspace id** in settings (or set
`ANTHROPIC_WORKSPACE_ID` in `.env.local`). Making a new API key inside a
workspace does the same without the id.

| Model               | Good for                      | Cost  |
| ------------------- | ----------------------------- | ----- |
| `claude-opus-5-5`   | the default: the hardest work | most  |
| `claude-sonnet-5-5` | everyday chat and code        | less  |
| `claude-haiku-5-5`  | quick questions               | least |
| `claude-fable-5-2`  | the newest Fable              |       |
| `claude-fable-5-1`  | the Fable before it           |       |

You pay by the token on your Anthropic account, and every message sends the
whole conversation again, so long chats cost more per message: the meter under
the message box and **compress** are how you keep that down. Current prices
are on [Anthropic's pricing page](https://www.anthropic.com/pricing); your
spend is in the Console. Any other model id can be typed in by choosing
"another model id…".

With Claude the **think** button sets how much effort it puts in, its thinking
is shown in summary, the globe turns on Anthropic's web search (billed per
search by Anthropic), and images you attach are read as images.

### Claude and a GitHub repository

Give Claude a repository and it can read it, search it, change files and open
a pull request, from the chat.

1. On GitHub: Settings, Developer settings, Personal access tokens,
   **Fine-grained tokens**, Generate new token. Under _Repository access_ choose
   **Only select repositories** and pick the ones you want Claude to work on.
   Under _Permissions_ set **Contents** and **Pull requests** to _Read and
   write_. Nothing else.
2. In ogchat settings (provider **claude**), paste it under **GitHub token** and
   press **test**: it should say who the token signs in as.
3. Make a project in the sidebar, open it (the gear beside its name) and put
   the repository under **GitHub repository**: `owner/name` or its address.
4. Start a chat in that project and ask: "what does this repo do?", "fix the
   typo in the README and open a pull request".

What Claude can and cannot do there:

- It reads from the default branch (or from its own branch once it has written
  to it).
- It writes **only** to a branch named `ogchat/<the chat's id>`, made from the
  default branch the first time it writes. One commit per file changed.
- It can open a pull request from that branch. It cannot merge, cannot push to
  your default branch, cannot touch another repository, and cannot run code:
  it never has a checkout, only the GitHub API.
- What it is doing shows under **thoughts** on the reply (`[reading
src/app.ts]`, `[writing README.md]`).
- You review and merge the pull request on GitHub, as with anybody's.

The token is kept exactly as the API key is (below): in `data/settings.json`
readable only by you, or in `.env.local` as `OGCHAT_GITHUB_TOKEN`; never sent
to the browser, to Anthropic, or anywhere but `api.github.com`. Claude is told
the repository's name, never the token. The limit on what can go wrong is the
token itself, which is why it should cover only the repositories you chose.

### Picking the repository, branch and environment for a chat

With Claude as the chat's model, a bar sits just above the message box:

- **repo**: the repository this chat works on. Click it for the list of
  repositories your token reaches, or type `owner/name`. No project is needed.
  Left empty, a chat in a project uses the project's repository.
- **branch**: the branch the work starts from, and the one a pull request goes
  into. Empty means the repository's default branch. Claude's own changes still
  go only to the chat's `ogchat/...` branch.
- **env**: the environment its commands run in (shown once _Let Claude run
  code_ is on).

Each chat keeps its own, so two chats, or two windows, can be at work on
different repositories at once. Set them before the first message or change
them later.

An **environment** is a named set-up for the folder commands run in. Choose
_edit environments…_ in the env list to make one:

- **Setup script**: shell commands run once in a chat's folder, inside its
  copy of the repository, before Claude's first command there (`npm install`,
  `pip install -r requirements.txt`). Run again if you change the script.
- **Variables**: `NAME=value` lines given to the setup script and to every
  command. Kept in `data/environments.json`, readable only by you. Claude can
  see them by running a command, so put a key there only if you mean it to be
  used.
- **Network**: allowed, or none. With none, commands cannot reach the network,
  so nothing they read can be sent anywhere; the setup script still can, to
  install what they need. This is enforced by the Mac sandbox and cannot be on
  other systems.

The `Default` environment has no setup, no variables, and the network.

Claude also has `edit_file`, which changes one piece of a file by giving the
text to replace: quicker and far cheaper than sending a whole file back.

### Letting Claude run code

Off unless you switch it on: **Let Claude run code**, in settings under the
GitHub token. Claude then has one more tool, `run_command`, which runs a shell
command on your computer and reads what it printed. In a project with a
repository it runs in a copy of that repository, so it can run the tests after
changing something; in any other chat it has a scratch folder.

This is the one part of ogchat where a model acts on your machine, so it is
fenced:

- Every chat has a folder of its own, `data/workspaces/<chat id>`. Commands
  start there and it is their home directory. Deleting the chat deletes it.
- On a Mac each command runs inside the system sandbox (`sandbox-exec`). It can
  write only in that folder and the temporary folders. It cannot read your home
  folder (documents, SSH keys, browser data), apart from where programming
  tools are installed (`~/.nvm`, `~/.cargo/bin` and the like), and it cannot
  read ogchat's settings, chats or `.env.local`. If the sandbox does not start,
  the command is not run. **test** in settings runs three harmless commands and
  tells you whether the fence held.
- On Linux and Windows there is no sandbox: commands run as you. The settings
  panel says so.
- Commands get a bare environment: no API key, no token.
- A command is stopped after two minutes unless Claude asks for longer (ten at
  most), and when you stop the reply.
- Commands can use the network (to install packages). So a command can send
  out what it can read, which is the repository copy. Do not switch this on for
  a repository whose contents you would not want leaving the machine.

The copy of the repository is fetched with your GitHub token before each
command: the chat's `ogchat/...` branch once it exists, otherwise the default
branch. It is for running things. What a command changes there is not sent to
GitHub; Claude still saves changes with `write_file`, one commit each. Installed
packages and build output stay between commands. `git` must be installed.

What Claude runs shows under **thoughts** (`[running: npm test]`).

Reading a repository is token-hungry: each file Claude opens is added to the
conversation and sent again with every step. For exploring, Sonnet or Haiku is
the economical choice; switch to Opus for the hard part.

### Claude Code, on the account it is signed in to

The third provider is not a key at all. A chat set to **Claude Code** starts
the `claude` program installed on this computer and shows what it says and
does. It is the real Claude Code: it works in a real copy of a repository,
edits files, runs commands and commits, and it uses whichever account it is
signed in to in Terminal, so it draws on that account's plan rather than on API
credit. ogchat never sees the sign-in; it starts the program and reads its
output.

1. Install Claude Code if it is not there (`claude --version` in Terminal says).
2. Sign in, in Terminal: `claude auth login`.
3. In settings choose **claude code** and press **test**: it says which
   account the program is signed in as. Nothing is sent to a model by the test.
4. Pick a Claude Code model in a chat's model list, or leave **claude code** as
   the provider in settings to make it the default for new chats.

**Which model.** _Claude Code · Fable 5.2_, _· Fable 5.1_, _· Opus 5.5_ and so
on pass that exact model id (`--model claude-fable-5-2`), so the chat gets that
model whatever version of Claude Code is installed. _Claude Code · Fable (its
newest)_ and the other aliases are whatever the installed Claude Code takes
them to mean, which can lag behind: an older Claude Code takes `fable` to be
Fable 5.1. Either way the reply says which model Claude Code actually used.

**More than one account.** See [Switching between Claude accounts](#switching-between-claude-accounts)
below: each account is a sign-in folder of its own, and a list at the top of a
Claude chat switches between them.

**What it may do** is set in settings: _look only_ (plan mode: read and
search), _edit files_ (the default), _edit files and run commands_, or _auto_
(Claude Code's own auto mode, which judges each action itself and covers all
of its tools). None of them stops to ask: what a level does not cover is
refused. It is never started with permissions switched off altogether. Unlike the API-key
Claude above, its commands are **not** inside ogchat's sandbox: they are
Claude Code's own, running as you, under its own rules.

**Where it works.** With a repository picked in the bar above the message box,
the chat gets a real clone of it under `data/workspaces/<chat id>/repos`, on a
branch named `ogchat/<chat id>` made from the branch you picked. It is cloned
once and then left alone: it is Claude Code's working copy from then on. It
commits there, and pushes or opens a pull request when you ask. If there is a
GitHub token in settings, git and `gh` inside the chat are signed in with it
(by environment, not written to disk); without one, this computer's own git
sign-in is used. With no repository the chat gets an empty folder of its own.

**Memory.** Each chat keeps one Claude Code session and resumes it, so Claude
Code remembers the files it has read. If you edit or delete a message, or
compress the chat, a new session is started and told what was said so far.

An environment's variables are given to it; its setup script is handed to
Claude Code to run when commands are allowed. The network switch and the
context meter do not apply: Claude Code manages its own context. Images
attached to a message are not passed on. Its usage counts against the plan of
the account it is signed in to, under that account's terms.

### Switching between Claude accounts

ogchat starts with one Claude account, called _main_: the sign-in Claude Code
already has in Terminal, and the API key in settings. To add another, open
settings, choose **claude** or **claude code**, and press **add an account**
beside _Claude account_. An account is either or both of:

- **A sign-in of Claude Code's.** Claude Code keeps one sign-in per folder
  (`~/.claude` by default), so a second account gets a folder of its own, such
  as `~/.claude-work`. Put it under **Account folder** and sign in to it once:

  ```bash
  CLAUDE_CONFIG_DIR=~/.claude-work claude auth login
  ```

  **test** then says who that folder is signed in as.

- **An API key** (and its workspace id, if it needs one), for chats on
  _claude_.

What an added account has none of its own, it shares with the main one: an
account with only a sign-in folder still uses the main API key, and one with
only a key still uses the main sign-in. Give each a name you will know it by
(_personal_, _work_); the main one can be renamed too.

**Switching.** Once there is more than one, a Claude chat has an **account**
list at the top right. Whichever is chosen there (or saved in settings) is the
one every Claude chat uses from the next message on; it is one switch for the
whole app, not one per chat. Each reply then says which account it ran on
(`account: work`) beside its model. A Claude Code chat that moves to another
account starts a fresh Claude Code session there and is told what was said so
far, since one account cannot resume another's session. Removing an account
from the list leaves its folder on disk alone. Keys are kept in
`data/settings.json` like the others, and are only ever shown masked.

### Plan usage or API tokens: what a Claude chat is paid for with

There are two ways to Claude here, and they are paid for differently:

| The chat is on                            | Each reply                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **claude code**, signed in to a plan      | counts against that Claude plan's session and weekly usage limits. No API tokens are spent.                 |
| **claude** (the API key in settings)      | is paid for in API tokens, from the credit on that key. The plan's usage limits are not touched.            |
| **claude code**, signed in to the Console | is paid for in API tokens too: Claude Code was signed in with `claude auth login --console`, not to a plan. |

ogchat says which it is in three places:

- **At the top right of a Claude chat**, a label reads `uses your plan` or, in
  amber, `uses api tokens`. Rest the pointer on it for the whole of it,
  including who Claude Code is signed in as. It reads `not signed in`, in red,
  when Claude Code has no sign-in on the account in use.
- **In the model list** beneath the chat, the models are listed under
  _Claude Code · uses your plan_ and _Claude API · uses API tokens_, so the
  choice between the two is made knowingly.
- **Beside each reply**, after the model's name: `plan usage` or
  `API tokens`. This is recorded when the reply is written, so it stays true
  of that reply after you switch.

For Claude Code, ogchat asks the program itself (`claude auth status`) how the
account in use is signed in, and asks again when you switch accounts. Claude
Code is never handed the API key from settings, so a chat on it is always
billed to its own sign-in. To move a Claude Code account from the Console to
a plan, sign in again with `claude auth login`. How much of a plan's usage is
left is not something Claude Code tells other programs: type `/usage` inside
`claude` in Terminal, or look under Settings → Usage on claude.ai.

### Any OpenAI-compatible provider

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

### The page: scene, black on white, or white on black

The switch at the top right, **scene · plain · formal** (also under _page_ in
the look panel), picks what is behind the chat:

- **scene** is the city and the wall.
- **plain** is black text on a white page.
- **formal** is white text on a black page, in thin grey rules.

Plain and formal have no city, no wall and no colour to speak of behind the
words, for long stretches of focused work. Text size and sidebar width still
apply, and **scene** brings everything back as it was.

### Chats on Claude have a page of their own

The page is kept twice: once for chats on Claude and Claude Code, and once for
chats on any other model. Chats on Claude start out **formal** and the rest on
the **scene**, so the two are told apart at a glance; in the sidebar a Claude
chat also carries a small **C**. The switch at the top right changes the page
for the kind of chat that is on screen, and the look panel has both: _page_
for the rest, and _claude chats_.

### Thinking, web search and a system prompt

- **Thinking.** The `think` button by the message box opens the effort levels
  as Claude's own apps show them: **Low, Medium, High, Extra and Max**, with
  Auto first. Extra is the API's `xhigh`. The level Claude recommends for the
  chat's model is marked _Recommended_ (High on Fable 5.2 and 5.1, Medium on
  Opus, Sonnet and Haiku 5.5), Auto says what the model runs at when no level
  is sent, and Max carries Claude's warning about long, costly replies.
  Settings has the same choice as the default for new chats. It is sent to
  Claude as `effort`, to Claude Code as `--effort`, and to the other provider
  as `reasoning_effort`, which has no `xhigh`, so Extra goes there as high.
  Auto sends nothing. On
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
- Hover any message you sent to copy it or to **ask again**, which sends the
  same question (and the files it had) as a new message at the end. Hover the
  last message you sent to edit or delete it; editing replaces the message and
  its reply, then asks again. Hover a reply to copy it, and the last reply to
  retry it. **copy chat**, under the message box, copies the whole conversation.
- Attach files with the paperclip, by dropping them on the chat, or by pasting
  (see below). Pasting more than 2,000 characters of text attaches it as a
  text file instead of filling the message box. Press the file to open it:
  before it is sent you can read and edit it there.
- Code in a reply sits in a panel as wide as its longest line, at the left, and
  scrolls sideways once it reaches the full width.
- **The context meter.** Under the message box: how much of the model's
  context window this conversation takes up, as a percentage, a bar and a
  count ("context 42% · 420k / 1M"). It turns amber at 70% (`compress soon`)
  and red at 90% (`compress now`); at 100% it reads `full: compress to
continue`. The count is an estimate from the length of the text, near
  enough to say when to compress. The window's size is set in settings.
- **Compress.** The button beside the meter has the model write a summary of
  the conversation so far. From then on the summary is sent in place of the
  messages it covers, which frees most of the window, and the conversation
  carries on. Nothing is deleted: the messages stay to read, a ruled line
  marks where the conversation was compressed, `show summary` shows what the
  model is working from, and `undo` sends the whole conversation again. It
  can be done as often as needed; each time folds the last summary and what
  has been said since into a new one. A conversation already over the window
  can still be compressed: the oldest messages are left out of that one
  request.
- The cursor in the message box, and in the box for editing a sent message, is
  a terminal's: a solid block on the
  character it is at, that character shown in reverse, blinking in whole
  steps. Click away and it becomes an outline, as in a terminal window that
  is not the active one. `BlockCaret.tsx` draws it.
- Every reply says, beside its time, which model wrote it and at which thinking
  level: `Fable 5.2 · think: extra`, or `Claude Code · Fable 5.1 · think: auto`.
  It is the model the provider reports, so a Claude Code alias shows the model
  it stood for, and a request Claude declined and handed on reads
  `Opus 5.5 (in place of Fable 5.2)`. Hover it for the full id, the way it was
  reached and the level that was sent. While a reply is being written the same
  line is in the status by the message box.
- A reply in progress has a clock beside it, `thinking 0:42` until the answer
  starts and `writing 1:10` after, also in the status by the message box. It
  counts from when the server started the reply, so a chat opened in another
  tab shows the real time. Once done, the reply keeps `took 1:52`.
- You can keep writing while a reply comes in. Enter puts the message in a
  queue above the box, and queued messages are sent one at a time, each when
  the reply before it is done, as in Claude's own apps. Each can be taken back
  into the box to edit, or removed. If you stop a reply, or it fails, the queue
  holds, and each message gets a **send now** button.
- While a reasoning model is working out its answer, `thinking` pulses slowly.
  If the provider shares the reasoning, it appears under that heading as it
  is written, folds away when the answer starts, and stays with the reply
  under `thoughts` for whenever you want to read it. It is never sent back to
  the provider.
- Stopping keeps the text received so far, marked `— stopped`.
- A reply keeps generating on the server if you switch sessions or close the
  tab, and is there when you come back. Only Stop ends it early.
- Provider errors, an invalid key, an account out of credits, an empty reply
  and network loss all appear inline with a retry. Your message is saved before the provider is called, so
  a failure never costs you the session.

Compressing waits on the model, which has to read the whole conversation and
write the summary: on a long chat with a large model that can take a minute or
more. The button counts the seconds while it works and stops it if pressed
(nothing is changed). It gives up by itself after four minutes. With Claude the
summary is written with thinking kept low, which is most of the wait; for a
quicker one still, set the chat to Sonnet or Haiku before compressing.

## A model for each chat

The model's name at the bottom right of the chat, under the message box, is a
list. Pick another and that chat uses it from the next message on; every chat
keeps its own, so one can run on Opus, another on Haiku and a third on your
other provider at the same time. It lists Claude's models if there is a Claude
key and the other provider's model if that has a key. A new chat starts on
whichever provider and model is chosen in settings, and you can pick before
the first message. Chats you never set a model on follow settings.

The **think** button beside the message box works the same way: it sets how
hard that chat's model thinks (auto, low, medium, high, max) and each chat
keeps its own, in the main window or in a window of its own. The level in
settings is the one a chat starts from.

## A chat in a window of its own

Drag a chat out of the list and let go anywhere outside it: it opens in a
window that shows only that chat, where you let go. (Or hover over the chat
and press **↗**.) Open as many as you like and put them side by side, each
with its own model.

While its window is open the chat stays in the list, greyed out and marked
`window`; clicking it there brings its window forward instead of opening it
twice. Close the window and it is an ordinary entry again. Nothing is moved or
copied: it is the same saved chat, shown somewhere else. What happens in a
window (a reply, a new title) shows in the list at once, and deleting the chat
from the list closes its window. In a browser, allow pop-ups for the page if
it asks.

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

**Opening a file.** Press an attached file to open it over the chat, dark on
light whatever the look. One that is still waiting in the message box can be
changed when it is text, which is how you edit a long paste: change it, then
**save** (⌘S) and it goes out as you left it. **remove** takes it off the
message, and closing with unsaved edits asks once before it throws them away.
A file on a sent message opens the same way, to read or copy: for a PDF that is
the text the model was given. **open in a window** puts it in a window of its
own.

Attachments stay part of the conversation: they are re-sent as context on every
later turn of that session, kept when you edit the message, and deleted from
disk when the message or session is deleted.

## Data

Everything is plain JSON under `data/` (override with `OGCHAT_DATA_DIR`):

```
data/
  settings.json            provider settings, including a key saved in the panel
  world.json               the day your street was first opened: what its wear is counted from
  weather/<date>.json      a past day's weather, kept once it has been asked for
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
    provider/adapter.ts            the only module that talks to an OpenAI-shaped provider
    provider/claude.ts             the only module that talks to Claude (Anthropic's SDK)
    server/github.ts               the repository tools Claude is given, and the only module that talks to GitHub
    server/workspace.ts            running commands for Claude: the per-chat folder, the sandbox, the repository copy
    server/claudecode.ts           Claude Code as a provider: starts the claude program for a chat and reads its events
    server/environments.ts         environments: a setup script, variables and a network switch for a chat's folder
    daylight.ts                    sun, moon and clock over Brooklyn
    server/                        persistence, projects, settings, turn handling, request guard
    client/api.ts                  browser client for the routes above
tests/                             vitest: persistence, adapter, route contract, attachments, the clock, the people
scripts/mock-provider.mjs          stand-in provider for local trials
scripts/mock-weather.mjs           stand-in weather service for local trials
scripts/mock-claude.mjs            stand-in Claude API and GitHub for local trials
electron/                          the Mac app: a window and a launcher around this project (its own package)
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
  - `scripts/art/street.mjs`: the four lettering faces (`FONTS`), shopfronts and what is in their
    windows, street signs and billboards. The shops themselves are listed in
    `brooklyn.mjs` (`shops`), the billboards in `skyline.mjs` (`boards`).
  - `scripts/art/wear.mjs`: the marks of age and the days they appear on.
    `WEAR_YEARS` is how long they are spread over.
  - `scripts/art/extras.mjs`: the figures seen in windows, and the grill and
    lights for a barbecue.
- **The people:** `src/components/shell/life.ts` decides who turns up and what
  they do. `STREET_MIX` is how often each kind of party appears, `wantedHeads`
  how many people the street aims for (three to five at an ordinary busy
  hour), `MAX_HEADS` the ceiling (20). `bustleAt` is how busy it is by the
  hour, the day of the week, the temperature and the weather: `WORKDAY`,
  `DAY_OFF` and `BY_TEMPERATURE` are the curves it reads. `trafficAt` does
  the same for the road. The rare ones (`canner`, `pacer`) are in
  `STREET_MIX` with the rest; `castSleeper` and `castPatrol` have timers of
  their own in `StreetLife.tsx`. To see the rare things without waiting for
  them, set `localStorage["ogchat:preview"]` in the browser's console to any
  of `patrol`, `call`, `sleeper`, `canner`, `pacer`, `courier`, `schoolbus`,
  `garbage`, `parcel`, `icecream`, `sweeper`, `mail`, `squirrel`, `rat`
  (separated by commas) and reload; remove it to go back. For the calendar,
  set the day in the look panel: a day in December for the lights, late
  October for pumpkins, 4 July at half past nine for fireworks.
- **The block's day:** `src/lib/nycday.ts` is when everything happens that is
  not people walking or lights going on: shop hours (`shopOpen`), collection
  and sweeping days, who visits and when (`visitsOn`), what people wear
  (`wardrobeFor`), the calendar, the wind. `StreetExtras.tsx` draws the
  small things and the service vehicles; `scripts/art/things.mjs` is where
  they are drawn, on one sheet, along with the pictures laid over the block
  for shutters, wet ground, snow banks and Christmas lights.
- **The sound:** `src/lib/ambience.ts`. Every sound is a few lines there:
  `carPass`, `chirp`, `thunder`, `siren`. `soundscapeOf` turns the scene
  into levels.
- **The lit windows:** `src/lib/citylights.ts` is the whole of who has a
  light on: when offices empty, when the cleaners come, when flats go to
  bed. `CityLights.tsx` draws the result. Which windows there are comes
  from the art: `home` in `scripts/art/lib.mjs` marks a window as lived
  behind, `building` says whether its building is offices or flats, and
  `src/components/shell/art/windows.ts` is the list that comes out.
- **Seasons and weather:** `FOLIAGE` in `brooklyn.mjs` holds each season's
  colours, and `snowfall` in `lib.mjs` lays the snow. `src/lib/weather.ts`
  holds the season by month, what each weather code from the service means
  for the scene (`WMO`), how grey each kind makes the sky (`greyOf`), and the
  odds used when the weather has to be made up (`ODDS`). `Weather.tsx` draws
  what falls. `src/lib/server/weatherfeed.ts` is the only module that talks
  to the weather service: the place asked about, how long a reading is kept,
  and which records are tried for a past day are all at the top of it.
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

| Route                                            | Purpose                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sessions?q=&project=`                  | List sessions, optionally filtered by text and by project (`project` is an id, or `none`)                                                                                                                                                                                 |
| `POST /api/sessions`                             | Create a session, optionally in a project `{ projectId? }`                                                                                                                                                                                                                |
| `GET /api/sessions/:id`                          | Session with messages (and its `summary` once compressed), plus `generating` / `partial` and `context: { tokens, limit }`                                                                                                                                                 |
| `PATCH /api/sessions/:id`                        | Rename `{ title }`, or file under a project `{ projectId }` (null takes it out)                                                                                                                                                                                           |
| `DELETE /api/sessions/:id`                       | Delete                                                                                                                                                                                                                                                                    |
| `POST /api/sessions/:id/messages`                | Send `{ content, replaceFromMessageId?, web? }` or `{ regenerate: true }`; streams NDJSON events `start`, `model` (which model and thinking level), `thinking`, `delta`, `done` / `error`. With attachments, send `multipart/form-data` with the same fields plus `files` |
| `GET /api/sessions/:id/files/:fileId`            | An attachment: images as images, everything else as plain text                                                                                                                                                                                                            |
| `DELETE /api/sessions/:id/messages/:messageId`   | Delete a user message and everything after it                                                                                                                                                                                                                             |
| `POST /api/sessions/:id/stop`                    | Stop the reply in progress                                                                                                                                                                                                                                                |
| `GET` / `PUT /api/settings`                      | Read (masked) / update provider settings: `baseUrl`, `model`, `apiKey`, `reasoning`, `systemPrompt`                                                                                                                                                                       |
| `GET /api/settings/sign-in`                      | `{ signIn: { state, email } }`: how Claude Code is signed in on the account in use. `state` is `plan` (replies count against a Claude plan), `api` (the Console: API tokens), `out` or `unknown`                                                                          |
| `POST /api/settings/test`                        | Try `{ baseUrl?, model?, apiKey? }` (or the current settings) against the provider without saving; returns `{ check }`                                                                                                                                                    |
| `GET /api/world`                                 | `{ world: { builtAt } }`: when this street was first opened                                                                                                                                                                                                               |
| `POST /api/sessions/:id/compress`                | `{ session, context }`: has the model summarise the conversation and keeps the summary with the session; waits for the model. `400 nothing_to_compress`, `409 busy`, `502` when the provider fails                                                                        |
| `DELETE /api/sessions/:id/compress`              | `{ session, context }`: drops the summary, so the whole conversation is sent again                                                                                                                                                                                        |
| `GET /api/weather`                               | `{ now }`: New York's weather at this moment (code, cloud, temperature, wind, snow lying)                                                                                                                                                                                 |
| `GET /api/weather?date=2025-01-06`               | `{ day: { date, hours } }`: that day hour by hour; `400 bad_date` outside 1 January 2025 to today, `502 weather_unavailable` when the service cannot be reached                                                                                                           |
| `GET` / `POST /api/projects`                     | List projects (with instructions, files and session counts) / create one `{ name }`                                                                                                                                                                                       |
| `GET` / `PATCH` / `DELETE /api/projects/:id`     | Read / update `{ name?, instructions? }` / delete a project. Its sessions are kept                                                                                                                                                                                        |
| `POST /api/projects/:id/files`                   | Add files (`multipart/form-data`, field `files`)                                                                                                                                                                                                                          |
| `GET` / `DELETE /api/projects/:id/files/:fileId` | A project file as the model receives it / remove it                                                                                                                                                                                                                       |

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

## Licence

MIT: use it, change it, share it. See [LICENSE](LICENSE). The weather data is
Open-Meteo's and comes under its own terms.
