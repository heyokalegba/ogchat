/**
 * The help: where things are in the window, and how to use the ones that are
 * not plain from looking. It is kept here as words, apart from the panel that
 * shows them, so that it can be read (and checked) in one place.
 *
 * In a line, `like this` marks a word as it is written on the screen, or
 * something to type.
 */

export interface HelpTopic {
  id: string;
  /** A word or two, for the row of jumps at the top of the help. */
  short: string;
  title: string;
  /** Where in the window it is, in a line. */
  where: string;
  points: readonly string[];
  /** Whether part of it is set in settings, so the topic ends in a way there. */
  settings?: boolean;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "paid",
    short: "plan or api tokens",
    title: "Plan usage or API tokens: what a chat is paid for with",
    where:
      "The label at the top right of a Claude chat, the model list at the bottom right under the message box, and the line beside each reply.",
    points: [
      "At the top right of a Claude chat a label reads `uses your plan` or, in amber, `uses api tokens`. Rest the pointer on it for the whole of it, including who Claude Code is signed in as. In red, `not signed in` means Claude Code has no sign-in on the account in use.",
      "A chat on a `Claude Code` model, signed in to a Claude plan, counts against that plan's session and weekly limits. No API tokens are spent.",
      "A chat on a `Claude API` model is paid for in API tokens, on the Claude API key in settings. The plan's limits are not touched.",
      "To move a chat from one to the other, pick a model in the list at the bottom right, under the message box. The models are grouped there as `Claude Code · uses your plan` and `Claude API · uses API tokens`.",
      "Each reply says `plan usage` or `API tokens` after its model's name, and goes on saying it after you switch.",
      "How much of a plan's usage is left is not shown here, because Claude Code does not tell other programs. Type `/usage` inside `claude` in Terminal, or look under Settings, then Usage, on claude.ai.",
    ],
  },
  {
    id: "folder",
    short: "local files",
    title: "Working on files on this computer",
    where:
      "The bar just above the message box, in a chat set to a Claude Code model: the `folder` box and `choose…` beside it.",
    points: [
      "Set the chat to a `Claude Code` model first, in the model list at the bottom right. The `folder` box is only there for those.",
      "Type or paste the folder's path in `folder`, such as `~/projects/site`, and press Enter. Or press `choose…` to pick it in the Mac's own folder window.",
      "From the next message on, Claude Code works in that folder. It reads the files there and edits them in place. ogchat keeps no copy and no undo of its own, so commit or copy first anything you could not afford to lose.",
      "What it may do there is set in settings: choose `claude code` at the top, then `What Claude Code may do`. It can look only, edit files (the usual one), edit files and run commands, or decide for itself. Commands run as you, outside ogchat's sandbox.",
      "A chat works in a folder or on a repository, not both: setting one clears the other. Clear the `folder` box to go back to a folder ogchat keeps for the chat.",
      "If the folder is moved or deleted, the next message says so instead of running somewhere else. Deleting the chat never touches the folder.",
      "A chat on a `Claude API` model has no folder of yours to work in. It works on a repository's copy, or on files you attach.",
    ],
    settings: true,
  },
  {
    id: "accounts",
    short: "accounts",
    title: "More than one Claude account, and switching between them",
    where:
      "Added in settings, under `Claude account`. Switched with the `account` list at the top right of a Claude chat.",
    points: [
      "Open settings, choose `claude` or `claude code` at the top, and press `add an account` beside `Claude account`. Give it a name you will know it by, such as personal or work.",
      "For a second Claude Code sign-in, choose `claude code` and give the account a folder of its own under `Account folder`, such as `~/.claude-work`. Sign in to it once in Terminal with `CLAUDE_CONFIG_DIR=~/.claude-work claude auth login`. After that, `test` says who it is signed in as.",
      "For a second API key, choose `claude` and put the key under `Claude API key` with that account picked.",
      "Once there is more than one account, a Claude chat has an `account` list at the top right. The one chosen there is the one every Claude chat uses from the next message on. It is one switch for the whole app, not one for each chat.",
      "Each reply says which account it ran on, beside its model.",
    ],
    settings: true,
  },
  {
    id: "colours",
    short: "account colours",
    title: "A colour for each account",
    where:
      "The `C` beside a chat in the list, the dot beside each reply, and the dot in the `account` list at the top right. Changed in settings, under `its colour`.",
    points: [
      "The colours appear once there is more than one Claude account. The first account is blue, the next green, then violet, and so on.",
      "In the list of chats, the `C` beside a Claude chat is filled with the colour of the account its latest reply ran on. Rest the pointer on it for the account's name.",
      "Beside each reply there is a dot in the colour of the account that reply ran on, so a chat that moved from one account to another shows where.",
      "At the top right, the dot in the `account` list is the colour of the account the next reply will run on.",
      "To give an account another colour, open settings, choose `claude` or `claude code`, pick the account under `Claude account`, press a colour under `its colour`, and save.",
    ],
    settings: true,
  },
  {
    id: "page",
    short: "the page",
    title: "The page: the scene, black on white, or white on black",
    where: "The `scene` `plain` `formal` switch at the top right.",
    points: [
      "`scene` is the city and the wall. `plain` is black text on a white page. `formal` is white text on a black page.",
      "The page is kept twice: once for chats on Claude, and once for chats on any other model. The switch changes it for the kind of chat that is on screen.",
      "The clock beside the switch opens the look panel: the time of day, the weather, the wall, and the size and colour of the text.",
    ],
  },
  {
    id: "where",
    short: "where things are",
    title: "Where everything is",
    where: "The whole window, a corner at a time.",
    points: [
      "Bottom of the chat list: `settings` and `help`. Settings has the provider, the API keys, the Claude accounts and their colours, what Claude Code may do, the GitHub token, whether Claude may run code, the thinking level, the system prompt and the context window.",
      "Top right of a chat: the `account` list, what the chat is paid for with, the page switch, the clock that opens the look panel, and `help` again.",
      "Just above the message box: where the chat works. That is `folder` on a Claude Code chat, or `repo` and `branch`, and `env`.",
      "Beside the message box: `think` for how hard the model thinks, the globe to search the web, and the paperclip to attach files.",
      "Under the message box: the context meter with `compress`, `copy chat`, and at the bottom right the model list, where each chat picks its own model.",
      "Top of the chat list: the search box, the projects, and the button for a new chat.",
    ],
    settings: true,
  },
];

/**
 * A line of the help in pieces, for the panel to set the marked words apart:
 * the pieces at odd places are the ones that were `marked`.
 */
export function helpPieces(line: string): string[] {
  return line.split("`");
}
