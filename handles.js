// Random display handles for room participants. Primary pool is JoJo's Bizarre
// Adventure Stand names; falls back to an adjective+animal generator if a room
// somehow has more participants than unused Stand names.

const STAND_NAMES = [
  "Star Platinum", "The World", "Silver Chariot", "Magician's Red",
  "Hierophant Green", "Hermit Purple", "Crazy Diamond", "Heaven's Door",
  "Echoes", "Killer Queen", "Sheer Heart Attack", "Love Deluxe", "Harvest",
  "Super Fly", "Bad Company", "Cheap Trick", "Highway Star",
  "Red Hot Chili Pepper", "Gold Experience", "Gold Experience Requiem",
  "Sticky Fingers", "Aerosmith", "King Crimson", "Epitaph", "Purple Haze",
  "Green Day", "Sex Pistols", "Spice Girl", "White Album", "Notorious B.I.G.",
  "Talking Head", "Moody Blues", "The Grateful Dead", "Man in the Mirror",
  "Metallica", "Beach Boy", "Stone Free", "Whitesnake", "C-Moon",
  "Made in Heaven", "Weather Report", "Heavy Weather", "Foo Fighters",
  "Limp Bizkit", "Bohemian Rhapsody", "Tusk", "Ball Breaker", "D4C",
  "Wonder of U", "Soft & Wet", "Paisley Park",
];

const FALLBACK_ADJECTIVES = [
  "Silver", "Crimson", "Golden", "Shadow", "Electric", "Velvet", "Frozen",
  "Blazing", "Midnight", "Neon", "Iron", "Crystal", "Wild", "Lucky",
  "Quiet", "Sly", "Bold", "Swift", "Rusty", "Cosmic",
];

const FALLBACK_ANIMALS = [
  "Fox", "Falcon", "Otter", "Wolf", "Hawk", "Panther", "Raven", "Lynx",
  "Badger", "Heron", "Cobra", "Stag", "Mantis", "Sparrow", "Tiger", "Owl",
  "Jackal", "Puma", "Crane", "Viper",
];

function fallbackHandle() {
  const adj = FALLBACK_ADJECTIVES[Math.floor(Math.random() * FALLBACK_ADJECTIVES.length)];
  const animal = FALLBACK_ANIMALS[Math.floor(Math.random() * FALLBACK_ANIMALS.length)];
  return `${adj} ${animal}`;
}

// takenHandles: Set/array of handles already in use in the room, to avoid collisions.
export function generateHandle(takenHandles = []) {
  const taken = new Set(takenHandles);
  const available = STAND_NAMES.filter((name) => !taken.has(name));

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  let handle = fallbackHandle();
  let attempts = 0;
  while (taken.has(handle) && attempts < 20) {
    handle = fallbackHandle();
    attempts += 1;
  }
  return handle;
}
