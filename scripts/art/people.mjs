/**
 * The people who live in the scenes: walkers, children, dogs and a pram, as
 * two small sprite sheets.
 *
 * Every row of a sheet is one character and every column one pose:
 *   columns 0-3   a walk cycle (contact, passing, contact, passing)
 *   columns 4-5   standing about (each character has its own way of waiting)
 * Everybody faces right; the backdrop mirrors them to walk left.
 *
 * Nobody is drawn by hand. Each character is dealt from a seeded deck of
 * skin, hair, hat, coat and trouser choices, so the street is full of
 * different people and the same script always casts the same crowd.
 */
import { canvas, dice, hex, shade } from "./lib.mjs";

export const FRAMES = 6;
export const WALK_FRAMES = 4;

/** One person's cell. The figure stands on the bottom row with a clear column either side. */
export const PERSON = { w: 9, h: 15 };
/** One dog's (or prop's) cell. */
export const PROP = { w: 12, h: 9 };

const SKIN = ["#e3bc98", "#d2a27c", "#b9835c", "#96633f", "#74492f", "#553626"].map(hex);
const HAIR = ["#16130f", "#2a1d15", "#4a3222", "#6b4a2c", "#8f8a82", "#a98a52", "#5e2f22"].map(hex);
const TOPS = [
  "#7a3328", // brick red
  "#8a4a36",
  "#39503f", // bottle green
  "#566b4a",
  "#34485e", // slate blue
  "#4f6a80",
  "#b79a4c", // mustard
  "#c9b98a",
  "#1c1c20", // black
  "#3b3b40",
  "#8d8a80", // grey
  "#d6cfbd", // cream
  "#5a4030", // brown
  "#6a4a66", // plum
  "#b0603a", // rust
  "#2f5a5a", // teal
].map(hex);
const LEGS = ["#22283a", "#2f3a52", "#17171a", "#3a3a3e", "#6b6250", "#4a4034", "#55606e"].map(hex);
const SHOES = ["#111114", "#2a2420", "#d8d4c8", "#6e4a34"].map(hex);
const BAGS = ["#2b2d33", "#7a3328", "#566b4a", "#b79a4c", "#34485e", "#8d8a80"].map(hex);

/**
 * Draws one person in one pose with their feet on (ox + 4, oy + PERSON.h - 1).
 * `pose` is 0-3 for the walk cycle and 4-5 for waiting.
 */
function person(c, ox, oy, look, pose) {
  const ground = oy + PERSON.h - 1;
  const { legs, torso, skin, hair, top, pants, shoes } = look;
  const far = (color) => shade(color, 0.72);
  const walking = pose < WALK_FRAMES;
  const passing = walking && pose % 2 === 1;
  // The body rides a pixel higher as one leg passes the other. Waiting, some people
  // settle a pixel on their second frame, which reads as shifting their weight.
  const sag = !walking && look.wait === "shift" && pose === 5 ? 1 : 0;
  const lift = passing ? 1 : 0;
  const hip = ground - legs - lift + sag; // the last row of the torso
  const px = (x, y, color) => c.set(ox + x, y, color);

  // ---- legs: the near leg is drawn after the far one, so it sits in front
  const leg = (xs, color, raised = 0) => {
    for (let r = 1; r <= legs + lift - sag - raised; r++) {
      const x = xs[Math.min(xs.length - 1, Math.floor(((r - 1) / (legs + lift)) * xs.length))];
      px(x, hip + r, r === legs + lift - sag - raised ? shoes : color);
    }
  };
  if (!walking) {
    leg([3], far(pants));
    leg([5], pants);
  } else if (passing) {
    // one leg straight under the body, the other lifted through
    leg([4], pose === 1 ? pants : far(pants));
    leg([5], pose === 1 ? far(pants) : pants, 1);
  } else {
    const forward = look.stride > 1 ? [5, 6, 7] : [5, 6];
    const back = look.stride > 1 ? [3, 2, 1] : [3, 2];
    leg(pose === 0 ? back : forward, far(pants));
    leg(pose === 0 ? forward : back, pants);
  }

  // ---- torso
  const shoulder = hip - torso + 1;
  for (let y = shoulder; y <= hip; y++) for (let x = 3; x <= 5; x++) px(x, y, top);
  px(3, shoulder, shade(top, 1.15));
  for (let y = shoulder; y <= hip; y++) px(3, y, shade(top, 0.86)); // the side away from the light
  if (look.coat) {
    // a long coat or a skirt hangs past the hips
    const hem = Math.min(look.coat, legs - 2);
    for (let y = hip + 1; y <= hip + hem; y++)
      for (let x = 3; x <= 5; x++) px(x, y, shade(top, 0.9));
  }
  if (look.pack) {
    for (let y = shoulder; y <= shoulder + 2; y++) px(2, y, look.pack);
    px(1, shoulder + 1, shade(look.pack, 0.8));
  }

  // ---- head
  const chin = shoulder - 1;
  for (let y = chin - 2; y <= chin; y++) for (let x = 3; x <= 5; x++) px(x, y, skin);
  px(5, chin, shade(skin, 0.86)); // jaw
  const turned = !walking && look.wait === "look" && pose === 5; // glancing back
  const back = turned ? 5 : 3;
  const crown = look.hat ?? hair;
  for (let x = 3; x <= 5; x++) px(x, chin - 3, crown);
  px(back, chin - 2, look.hat && look.hatStyle === "cap" ? hair : crown);
  if (look.hatStyle === "cap") px(turned ? 2 : 6, chin - 2, shade(crown, 0.8)); // the peak
  if (look.hatStyle === "beanie") for (let x = 3; x <= 5; x++) px(x, chin - 2, crown);
  if (look.hatStyle === "beanie") px(turned ? 3 : 5, chin - 2, skin);
  if (look.long) {
    // hair to the shoulders
    px(back, chin - 1, hair);
    px(turned ? 6 : 2, chin - 2, hair);
    px(turned ? 6 : 2, chin - 1, hair);
    px(turned ? 6 : 2, chin, hair);
  }
  if (look.puff) {
    for (let x = 2; x <= 6; x++) px(x, chin - 3, hair);
    for (let x = 3; x <= 5; x++) px(x, chin - 4, hair);
    px(turned ? 6 : 2, chin - 2, hair);
  }

  // ---- arms
  const sleeve = look.bare ? skin : shade(top, 0.8);
  const hand = skin;
  const arm = (pixels) => pixels.forEach(([x, y, color]) => px(x, shoulder + y, color));
  if (walking && !passing) {
    const swing = look.stride > 1 ? 2 : 1;
    const ahead = [
      [6, 1, far(sleeve)],
      [6 + (swing > 1 ? 1 : 0), 2, far(hand)],
    ];
    const behind = [
      [2, 1, sleeve],
      [2 - (swing > 1 ? 1 : 0), 2, hand],
    ];
    // the arms swing against the legs
    arm(pose === 0 ? behind : behind.map(([x, y, col]) => [8 - x, y, col]));
    arm(pose === 0 ? ahead : ahead.map(([x, y, col]) => [8 - x, y, far(col)]));
  } else if (walking) {
    arm([
      [4, 1, sleeve],
      [4, 2, sleeve],
      [4, 3, hand],
    ]);
  } else if (look.wait === "phone" && pose === 4) {
    // looking down at a phone
    arm([
      [6, 1, sleeve],
      [6, 0, hand],
      [6, -1, hex("#bfd3dc")],
    ]);
  } else {
    arm([
      [4, 1, sleeve],
      [4, 2, sleeve],
      [4, 3, hand],
    ]);
  }
  if (look.bag) {
    // carried in the near hand: it stays put while the arm swings
    const y = hip + 1 - lift + sag;
    for (let yy = y; yy <= y + 1; yy++) for (let x = 3; x <= 4; x++) px(x, yy, look.bag);
    px(4, y - 1, shade(look.bag, 0.7));
  }
}

function castPerson(d, kind) {
  const { pick, chance, between } = d;
  const child = kind === "child";
  const runner = kind === "runner";
  const hatStyle = chance(child ? 0.25 : 0.34) ? pick(["cap", "beanie", "beanie"]) : null;
  const top = pick(runner ? TOPS.slice(4, 16) : TOPS);
  return {
    legs: child ? 3 : runner ? 5 : between(4, 5),
    torso: child ? 3 : between(4, 5),
    stride: runner ? 2 : 1,
    skin: pick(SKIN),
    hair: pick(HAIR),
    top,
    pants: runner ? pick([LEGS[2], LEGS[0], SKIN[2]]) : pick(LEGS),
    shoes: runner ? SHOES[2] : pick(SHOES),
    hat: hatStyle ? pick(TOPS) : null,
    hatStyle,
    long: !hatStyle && chance(0.3),
    puff: !hatStyle && chance(0.12),
    bare: runner || chance(0.2),
    coat: !runner && !child && chance(0.3) ? between(1, 2) : 0,
    pack: !runner && chance(child ? 0.5 : 0.2) ? pick(BAGS) : null,
    bag: !runner && !child && chance(0.16) ? pick(BAGS) : null,
    wait: runner ? "shift" : pick(["phone", "look", "shift", "look"]),
  };
}

/** How many of each kind of person the sheet holds, in row order. */
export const CAST = { adults: 26, children: 6, runners: 4 };

/** Every person, one per row. Rows: adults, then children, then runners. */
export function peopleSheet() {
  const kinds = [
    ...Array(CAST.adults).fill("adult"),
    ...Array(CAST.children).fill("child"),
    ...Array(CAST.runners).fill("runner"),
  ];
  const c = canvas(PERSON.w * FRAMES, PERSON.h * kinds.length);
  const d = dice(4242);
  kinds.forEach((kind, row) => {
    const look = castPerson(d, kind);
    for (let pose = 0; pose < FRAMES; pose++) {
      person(c, pose * PERSON.w, row * PERSON.h, look, pose);
    }
  });
  return c;
}

// ---------------------------------------------------------------- dogs and props

const COATS = [
  ["#2a2420", "#17130f"], // black
  ["#8a6238", "#5e3f22"], // tan
  ["#cfc6b2", "#a59c88"], // cream
  ["#5a4030", "#3b281c"], // chocolate
  ["#8d8a80", "#5f5c55"], // grey
  ["#b9834c", "#d8cdb6"], // ginger with a pale muzzle
].map((pair) => pair.map(hex));

/** One dog in one pose, nose to the right, paws on the bottom row of its cell. */
function dog(c, ox, oy, look, pose) {
  const ground = oy + PROP.h - 1;
  const { long, tall, coat, shadow } = look;
  const walking = pose < WALK_FRAMES;
  const sniffing = !walking;
  const belly = ground - tall; // the last row of the body
  const tailX = 2;
  const chest = tailX + long; // the last column of the body
  const px = (x, y, color) => c.set(ox + x, y, color);

  for (let x = tailX; x <= chest; x++) {
    px(x, belly - 1, coat);
    px(x, belly, x === tailX ? shadow : coat);
  }
  // the head: up when trotting, down to the pavement when something smells interesting
  const hy = sniffing ? belly + 1 : belly - 2;
  px(chest + 1, hy, coat);
  px(chest + 2, hy, coat);
  px(chest + 1, hy + 1, coat);
  px(chest + 2, hy + 1, look.muzzle);
  px(chest + 3, hy + 1, hex("#141110")); // nose
  px(chest + 1, hy - 1, shadow); // ear
  if (sniffing) px(chest + 1, belly, coat);
  // the tail: up and wagging at a standstill, streaming behind on the move
  if (sniffing) px(tailX - 1, belly - (pose === 4 ? 2 : 3), coat);
  else px(tailX - 1, belly - 1 - (pose % 2), coat);
  if (sniffing) px(tailX - (pose === 4 ? 1 : 0), belly - 2, coat);

  // legs
  const legRows = tall;
  const paw = (x, lean, color) => {
    for (let r = 1; r <= legRows; r++) {
      px(x + (r === legRows ? lean : 0), belly + r, color);
    }
  };
  if (!walking || pose % 2 === 1) {
    paw(tailX + 1, 0, shadow);
    paw(chest, 0, coat);
  } else if (pose === 0) {
    paw(tailX, -1, shadow);
    paw(tailX + 1, 0, coat);
    paw(chest - 1, 0, shadow);
    paw(chest, 1, coat);
  } else {
    paw(tailX + 1, 1, shadow);
    paw(tailX, 0, coat);
    paw(chest, -1, shadow);
    paw(chest - 1, 0, coat);
  }
}

/** A pram, pushed from the left. Its wheels are the only thing that changes. */
function pram(c, ox, oy, pose) {
  const ground = oy + PROP.h - 1;
  const px = (x, y, color) => c.set(ox + x, y, color);
  const body = hex("#7a3328");
  const frame = hex("#17171a");
  const tyre = hex("#0e0e11");
  for (let x = 3; x <= 9; x++) for (let y = ground - 5; y <= ground - 3; y++) px(x, y, body);
  for (let x = 3; x <= 9; x++) px(x, ground - 3, shade(body, 0.7));
  // the hood, raised over the far end
  for (let x = 6; x <= 9; x++)
    for (let y = ground - 8; y <= ground - 6; y++) px(x, y, shade(body, 1.2));
  px(6, ground - 8, shade(body, 0.7));
  px(5, ground - 6, shade(body, 1.2));
  px(2, ground - 6, frame); // the handle, up to the pusher's hands
  px(1, ground - 7, frame);
  px(0, ground - 7, frame);
  for (let x = 3; x <= 9; x++) px(x, ground - 2, frame); // chassis
  for (const wx of [3, 8]) {
    for (let x = wx; x <= wx + 1; x++) for (let y = ground - 1; y <= ground; y++) px(x, y, tyre);
    px(wx + (pose % 2), ground - (pose % 2), hex("#8d8a80")); // a spoke going round
  }
}

/**
 * A lead from a hand (top left) to a collar (right), sagging on the way. The
 * backdrop lays it between a walker and the dog trotting ahead.
 */
export const LEAD = { length: 11, hand: 6, collar: 3 };

function lead(c, ox, oy) {
  const ground = oy + PROP.h - 1;
  const color = hex("#1c1917");
  [6, 5, 4, 4, 3, 3, 3, 3, 3, 3, 3].forEach((up, x) => c.set(ox + x, ground - up, color));
}

/** Rows of the props sheet. Dogs first, small to large. */
export const DOGS = 8;
export const PROPS = { pram: DOGS, lead: DOGS + 1, rows: DOGS + 2 };

export function propsSheet() {
  const c = canvas(PROP.w * FRAMES, PROP.h * PROPS.rows);
  const d = dice(77);
  for (let row = 0; row < DOGS; row++) {
    const [coat, second] = d.pick(COATS);
    const big = row >= DOGS / 2;
    const look = {
      long: big ? d.between(4, 5) : d.between(2, 3),
      tall: big ? 2 : 1,
      coat,
      shadow: shade(coat, 0.7),
      muzzle: d.chance(0.4) ? second : coat,
    };
    for (let pose = 0; pose < FRAMES; pose++) dog(c, pose * PROP.w, row * PROP.h, look, pose);
  }
  for (let pose = 0; pose < FRAMES; pose++) {
    pram(c, pose * PROP.w, PROPS.pram * PROP.h, pose);
    lead(c, pose * PROP.w, PROPS.lead * PROP.h);
  }
  return c;
}

/** What the backdrop needs to know to cut the sheets up. */
export const PEOPLE_META = {
  frames: FRAMES,
  walkFrames: WALK_FRAMES,
  person: { ...PERSON, rows: CAST.adults + CAST.children + CAST.runners },
  prop: { ...PROP, rows: PROPS.rows },
  cast: {
    adults: [0, CAST.adults],
    children: [CAST.adults, CAST.children],
    runners: [CAST.adults + CAST.children, CAST.runners],
    // the first half of the dogs are small, the second half large
    dogs: [0, DOGS],
    pram: PROPS.pram,
    lead: PROPS.lead,
  },
};
