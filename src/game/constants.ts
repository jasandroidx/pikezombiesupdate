import { Weapon, GameLocation, Perk, ZombieType } from "../types/game";

export const INITIAL_WEAPONS: Weapon[] = [
  {
    id: "revolver",
    name: ".357 Trail Magnum",
    category: "Sidearm",
    description: "Heavy Pike County revolver. One-handed thunder that still stops a shambler cold. Rumor: hand-loaded lead and a supply chest wake something up in it.",
    damage: 65,
    fireRate: 2.2,
    pellets: 1,
    spread: 0.04,
    range: 650,
    bulletSpeed: 16,
    magazineSize: 6,
    currentMag: 6,
    reserveAmmo: 48,
    maxReserveAmmo: 72,
    reloadTime: 1600,
    pierce: 1,
    soundType: "magnum",
    unlocked: true,
    cost: 0,
    upgradeLevel: 1,
  },
  {
    id: "shotgun",
    name: "12-Ga. Pump",
    category: "Shotgun",
    description: "Barn gun. Turns a hallway of infected into Patoka mud.",
    damage: 26,
    fireRate: 1.05,
    pellets: 8,
    spread: 0.32,
    range: 420,
    bulletSpeed: 13,
    magazineSize: 6,
    currentMag: 6,
    reserveAmmo: 40,
    maxReserveAmmo: 60,
    reloadTime: 2200,
    pierce: 1,
    soundType: "shotgun",
    unlocked: true,
    cost: 0,
    upgradeLevel: 1,
  },
  {
    id: "lever_rifle",
    name: "30-30 Lever Gun",
    category: "Rifle",
    description: "Deer rifle off a Washington Township porch. Drills through two, sometimes three.",
    damage: 140,
    fireRate: 1.4,
    pellets: 1,
    spread: 0.015,
    range: 900,
    bulletSpeed: 22,
    magazineSize: 5,
    currentMag: 5,
    reserveAmmo: 24,
    maxReserveAmmo: 40,
    reloadTime: 2000,
    pierce: 3,
    soundType: "rifle",
    unlocked: false,
    cost: 350,
    upgradeLevel: 1,
  },
  {
    id: "carbine",
    name: "Guard Carbine",
    category: "Assault",
    description: "Pulled from an Indiana National Guard checkpoint on US-41 after the road went quiet.",
    damage: 42,
    fireRate: 7.5,
    pellets: 1,
    spread: 0.08,
    range: 750,
    bulletSpeed: 19,
    magazineSize: 30,
    currentMag: 30,
    reserveAmmo: 80,
    maxReserveAmmo: 160,
    reloadTime: 1800,
    pierce: 1,
    soundType: "carbine",
    unlocked: false,
    cost: 650,
    upgradeLevel: 1,
  },
  {
    id: "crossbow",
    name: "Silent Hunter",
    category: "Special",
    description: "Broadheads. No report. The horde does not turn unless they see the light.",
    damage: 180,
    fireRate: 0.9,
    pellets: 1,
    spread: 0.01,
    range: 850,
    bulletSpeed: 18,
    magazineSize: 1,
    currentMag: 1,
    reserveAmmo: 18,
    maxReserveAmmo: 30,
    reloadTime: 1400,
    pierce: 2,
    soundType: "crossbow",
    unlocked: false,
    cost: 500,
    upgradeLevel: 1,
  },
  {
    id: "chainsaw",
    name: "Stihl Yard Saw",
    category: "Melee Heavy",
    description: "Two-stroke from a barn loft. Eats fuel. Eats everything else faster.",
    damage: 35,
    fireRate: 12,
    pellets: 1,
    spread: 0.5,
    range: 95,
    bulletSpeed: 12,
    magazineSize: 100,
    currentMag: 100,
    reserveAmmo: 160,
    maxReserveAmmo: 240,
    reloadTime: 1200,
    pierce: 99,
    soundType: "chainsaw",
    unlocked: false,
    cost: 800,
    upgradeLevel: 1,
  },
];

export const AVAILABLE_PERKS: Perk[] = [
  {
    id: "grit",
    name: "Patoka Grit",
    description: "+25 max health and 15% faster recovery.",
    cost: 250,
    level: 0,
    maxLevel: 4,
    icon: "Shield",
  },
  {
    id: "quickdraw",
    name: "Hargrove Trigger",
    description: "+18% fire rate and 20% faster reloads.",
    cost: 300,
    level: 0,
    maxLevel: 3,
    icon: "Zap",
  },
  {
    id: "highbeam",
    name: "High-Beam Maglite",
    description: "Flashlight cone reaches 25% farther.",
    cost: 180,
    level: 0,
    maxLevel: 3,
    icon: "Sun",
  },
  {
    id: "scavenger",
    name: "Hollow Scavenger",
    description: "+35% ammo and scrap from the dead.",
    cost: 220,
    level: 0,
    maxLevel: 3,
    icon: "Package",
  },
  {
    id: "moonshiner",
    name: "190-Proof Mash",
    description: "Molotov pools burn 40% larger and linger longer.",
    cost: 280,
    level: 0,
    maxLevel: 3,
    icon: "Flame",
  },
  {
    id: "hollowpoint",
    name: "Hand-Loaded Lead",
    description: "All kinetic weapons deal +20% damage.",
    cost: 400,
    level: 0,
    maxLevel: 3,
    icon: "Target",
  },
  {
    id: "choke",
    name: "Barn Choke",
    description: "Shotgun patterns tighten and gain extra shot.",
    cost: 260,
    level: 0,
    maxLevel: 3,
    icon: "Target",
  },
];

export const GAME_LOCATIONS: GameLocation[] = [
  {
    id: "white_oak_springs",
    name: "White Oak Springs",
    countyZone: "Washington Township",
    township: "First settlement, 1817",
    description: "Pike County's first white settlement. Cellar holes, a spring that tastes of iron, and a lantern that should have gone out fifty years ago.",
    mapWidth: 2000,
    mapHeight: 1800,
    ambientLight: 0.22,
    weather: "mist",
    fogDensity: 0.42,
    ground: "#1a1d16",
    trail: "#2a241c",
    workbench: { x: 980, y: 940 },
    extract: { x: 1320, y: 980, radius: 70 },
    spawn: { x: 1168, y: 848 },
    lantern: { x: 1144, y: 768 },
    holes: [
      { x: 840, y: 1140, kind: "cellar" },
      { x: 1180, y: 1140, kind: "cellar" },
      { x: 640, y: 720, kind: "cellar" },
    ],
    obstacles: [
      { x: 900, y: 740, width: 220, height: 150, type: "cabin", label: "HARGROVE PLACE" },
      { x: 1260, y: 860, width: 130, height: 72, type: "pickup_truck", color: "#5c2a22" },
      { x: 1040, y: 620, width: 70, height: 54, type: "spring", label: "WHITE OAK SPRING" },
      { x: 620, y: 580, width: 58, height: 58, type: "tree" },
      { x: 1480, y: 520, width: 64, height: 64, type: "tree" },
      { x: 480, y: 1180, width: 70, height: 70, type: "tree" },
      { x: 1560, y: 1240, width: 62, height: 62, type: "tree" },
      { x: 1100, y: 1280, width: 52, height: 46, type: "rock" },
      { x: 760, y: 1000, width: 46, height: 42, type: "crate" },
      { x: 960, y: 920, width: 56, height: 40, type: "workbench", label: "SHED" },
    ],
    barrels: [
      { x: 730, y: 980 },
    ],
    lights: [
      { x: 925, y: 760, radius: 95, intensity: 0.85 },
      { x: 1070, y: 760, radius: 90, intensity: 0.8 },
      { x: 1075, y: 640, radius: 70, intensity: 0.55 },
    ],
    barricades: [
      { x: 840, y: 900, width: 90, height: 18, type: "wood_fence" },
      { x: 1140, y: 900, width: 90, height: 18, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_springs_journal",
        locationId: "white_oak_springs",
        title: "Henry Stillwell's Camp Book",
        author: "Henry Stillwell",
        date: "October 12, 1983",
        content: [
          "Lincoln camped here on the road to Vincennes. So did I, a hundred and fifty years later, because the spring never froze.",
          "Three weeks back the water went to iron and sulfur. Doc Vance said typhoid. Typhoid don't make a man's eyes milk over while he still walks.",
          "I boarded the cellar. If you find this: they come out of the holes. Don't go down.",
        ],
        x: 1020,
        y: 840,
        radius: 26,
      },
      {
        id: "note_hargrove_deed",
        locationId: "white_oak_springs",
        title: "Water-Stained Township Deed",
        author: "Col. Hargrove's line",
        date: "November 1, 1983",
        content: [
          "White Oak Springs was the first. Petersburg was the seat. The dead do not care which.",
          "Lantern in the east window means the Hargrove place is still held. If the lantern's out, burn the cabin and keep walking the Trace.",
        ],
        x: 1280,
        y: 900,
        radius: 26,
      },
    ],
  },
  {
    id: "mccords_ford",
    name: "McCord's Ford",
    countyZone: "Patoka Township",
    township: "Yellow Banks Trace",
    description: "Where the East and West traces meet the Patoka. Lincoln crossed here in 1830. Tonight the river is full of floaters.",
    mapWidth: 2200,
    mapHeight: 1800,
    ambientLight: 0.14,
    weather: "fog",
    fogDensity: 0.5,
    ground: "#161914",
    trail: "#2c261c",
    workbench: { x: 1080, y: 1120 },
    extract: { x: 1460, y: 760, radius: 75 },
    spawn: { x: 1100, y: 1180 },
    obstacles: [
      { x: 880, y: 860, width: 280, height: 70, type: "ford", label: "McCORD'S FORD" },
      { x: 620, y: 700, width: 160, height: 110, type: "barn", label: "McCORD BARN" },
      { x: 1400, y: 720, width: 135, height: 72, type: "pickup_truck", color: "#3e2a1a" },
      { x: 1060, y: 1100, width: 56, height: 40, type: "workbench", label: "SHED" },
      { x: 480, y: 500, width: 62, height: 62, type: "tree" },
      { x: 1680, y: 480, width: 68, height: 68, type: "tree" },
      { x: 420, y: 1280, width: 70, height: 70, type: "tree" },
      { x: 1760, y: 1220, width: 64, height: 64, type: "tree" },
      { x: 1180, y: 1280, width: 80, height: 56, type: "rock" },
      { x: 780, y: 1100, width: 48, height: 42, type: "crate" },
      { x: 1520, y: 1040, width: 50, height: 44, type: "crate" },
    ],
    barrels: [
      { x: 820, y: 780 },
      { x: 1180, y: 820 },
      { x: 1480, y: 900 },
      { x: 700, y: 1040 },
    ],
    lights: [
      { x: 700, y: 740, radius: 100, intensity: 0.7 },
      { x: 1470, y: 750, radius: 80, intensity: 0.55 },
    ],
    barricades: [
      { x: 860, y: 820, width: 110, height: 16, type: "wood_fence" },
      { x: 1080, y: 820, width: 110, height: 16, type: "wood_fence" },
      { x: 980, y: 1080, width: 80, height: 16, type: "sandbags" },
    ],
    loreNotes: [
      {
        id: "note_lincoln_trace",
        locationId: "mccords_ford",
        title: "Pencil on a Feed Sack",
        author: "Unknown",
        date: "Unknown",
        content: [
          "East Trace and West Trace come together here. So did the Lincolns, going north in 1830.",
          "There is no boat. The water is full of floaters that bite if you try to swim.",
          "If you have mash or gasoline, mix it with rags. Fire is the only thing that makes them hesitate.",
        ],
        x: 1000,
        y: 900,
        radius: 26,
      },
      {
        id: "note_horseshoe",
        locationId: "mccords_ford",
        title: "Conservancy Notice",
        author: "Upper Patoka River Conservancy",
        date: "September 8, 1983",
        content: [
          "Horseshoe Bend was straightened in the 1920s. The old channel is still down there under the silt.",
          "Air monitors at the dredge spoil read clean. The crew did not. They stood back up.",
          "Do not wade. Do not drag. Burn what comes out of the cut.",
          "Jackson Corn's entry, southwest quarter of Section 16, Township 2 South, Range 7 West, holds a sandstone bridge thirty feet long. Do not shelter under it.",
        ],
        x: 1440,
        y: 760,
        radius: 26,
      },
    ],
  },
  {
    id: "stendal_backbone",
    name: "Stendal Backbone",
    countyZone: "Lockhart Township",
    township: "Strip-mine highwall",
    description: "A sandstone ridge between Cup Creek and the South Patoka. The highwall dropped. Something in the pit learned to climb.",
    mapWidth: 2200,
    mapHeight: 1900,
    ambientLight: 0.12,
    weather: "night_clear",
    fogDensity: 0.46,
    ground: "#141816",
    trail: "#2a2c28",
    workbench: { x: 1040, y: 1240 },
    extract: { x: 1580, y: 980, radius: 80 },
    spawn: { x: 1040, y: 1320 },
    holes: [
      { x: 1100, y: 920, kind: "pit" },
      { x: 1260, y: 900, kind: "pit" },
      { x: 940, y: 910, kind: "pit" },
    ],
    obstacles: [
      { x: 860, y: 620, width: 420, height: 90, type: "highwall", label: "STENDAL HIGHWALL" },
      { x: 980, y: 740, width: 240, height: 160, type: "mine_entrance", label: "PIT ACCESS" },
      { x: 700, y: 980, width: 110, height: 58, type: "crate", color: "#2c3330" },
      { x: 1380, y: 980, width: 120, height: 58, type: "crate", color: "#2c3330" },
      { x: 860, y: 1240, width: 140, height: 72, type: "pickup_truck", color: "#4a4036" },
      { x: 1020, y: 1220, width: 56, height: 40, type: "workbench", label: "TIPPLE SHED" },
      { x: 520, y: 720, width: 64, height: 64, type: "rock" },
      { x: 1680, y: 740, width: 78, height: 78, type: "rock" },
      { x: 1180, y: 1420, width: 58, height: 52, type: "crate" },
      { x: 430, y: 1400, width: 60, height: 60, type: "tree" },
      { x: 1760, y: 1480, width: 62, height: 62, type: "tree" },
    ],
    barrels: [
      { x: 930, y: 760 },
      { x: 1280, y: 760 },
      { x: 670, y: 940 },
      { x: 1460, y: 1060 },
    ],
    lights: [
      { x: 1100, y: 800, radius: 110, intensity: 0.5 },
      { x: 1040, y: 1100, radius: 80, intensity: 0.7 },
    ],
    barricades: [
      { x: 900, y: 920, width: 120, height: 20, type: "coal_cart" },
      { x: 1180, y: 920, width: 120, height: 20, type: "coal_cart" },
    ],
    loreNotes: [
      {
        id: "note_mine_incident",
        locationId: "stendal_backbone",
        title: "Sealed Shift Report",
        author: "Foreman Grady McCoy",
        date: "September 19, 1983",
        content: [
          "The highwall let go on the night shift. Not a slide — a breath. The pit exhaled.",
          "Zero methane. The crew went to convulsions anyway. Rescue found them standing.",
          "We locked the bulkhead from the surface. Fifty-two men are down there, and they know the latch.",
        ],
        x: 1100,
        y: 800,
        radius: 26,
      },
      {
        id: "note_dragline",
        locationId: "stendal_backbone",
        title: "Peabody Equipment Log",
        author: "Night oiler",
        date: "October 3, 1983",
        content: [
          "Dragline walked itself twenty yards toward Stendal. Cab empty. Lights on.",
          "Helmet lamps in the pit are not ours. They don't bob like a man walking. They hunt.",
          "If the Behemoth comes over the wall, you do not hold the ridge. You run the Trace.",
        ],
        x: 760,
        y: 1000,
        radius: 26,
      },
    ],
  },
  {
    id: "petersburg_square",
    name: "Petersburg Square",
    countyZone: "Washington Township",
    township: "County seat, 1817",
    description: "Courthouse lawn, abandoned cruisers on Main, sandbags on the steps. The last dry ground in the county if the radio is telling the truth.",
    mapWidth: 2400,
    mapHeight: 1800,
    ambientLight: 0.2,
    weather: "rain",
    fogDensity: 0.32,
    ground: "#1a1816",
    trail: "#2e2a26",
    workbench: { x: 1180, y: 1120 },
    extract: { x: 1740, y: 900, radius: 80 },
    spawn: { x: 1200, y: 1180 },
    bell: { x: 1180, y: 938 },
    obstacles: [
      { x: 1040, y: 680, width: 280, height: 200, type: "courthouse", label: "PIKE CO. COURTHOUSE" },
      { x: 820, y: 860, width: 140, height: 70, type: "cruiser", color: "#1e3a5f" },
      { x: 1400, y: 840, width: 140, height: 70, type: "cruiser", color: "#1e3a5f" },
      { x: 1160, y: 1100, width: 56, height: 40, type: "workbench", label: "ARMORY CAGE" },
      { x: 520, y: 1100, width: 64, height: 64, type: "tree" },
      { x: 1760, y: 1160, width: 64, height: 64, type: "tree" },
      { x: 1080, y: 1280, width: 80, height: 56, type: "rock" },
      { x: 700, y: 600, width: 50, height: 44, type: "crate" },
      { x: 1640, y: 620, width: 50, height: 44, type: "crate" },
      { x: 1680, y: 820, width: 130, height: 72, type: "pickup_truck", color: "#3d2a22" },
    ],
    barrels: [
      { x: 800, y: 780 },
      { x: 1010, y: 820 },
      { x: 1480, y: 780 },
      { x: 760, y: 1080 },
    ],
    lights: [
      { x: 1180, y: 760, radius: 140, intensity: 0.75 },
      { x: 890, y: 890, radius: 70, intensity: 0.45 },
      { x: 1470, y: 870, radius: 70, intensity: 0.45 },
    ],
    barricades: [
      { x: 1020, y: 900, width: 130, height: 18, type: "sandbags" },
      { x: 1220, y: 900, width: 130, height: 18, type: "sandbags" },
      { x: 900, y: 1040, width: 90, height: 16, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_square_orders",
        locationId: "petersburg_square",
        title: "National Guard Standing Orders",
        author: "Capt. R. Sterling, Indiana Guard",
        date: "November 12, 1983",
        content: [
          "Quarantine holds at the county line. No one from Pike crosses into Dubois. Huntingburg is not a refuge.",
          "Infection rides saliva and the fog. Keep the searchlight on the square. If the courthouse falls, burn the records and fall back to the Trace.",
        ],
        x: 1180,
        y: 720,
        radius: 26,
      },
      {
        id: "note_sheriff",
        locationId: "petersburg_square",
        title: "Water-Stained Dispatch",
        author: "Deputy C. Miller, Pike Co. Sheriff",
        date: "November 2, 1983",
        content: [
          "Code 99 at the springs. Road blocked by timber trucks that nobody parked.",
          "Shot one three times with issue .38. It kept crawling with half a collarbone.",
          "If the bell rings at dawn, we held. If it doesn't, don't come looking.",
        ],
        x: 900,
        y: 880,
        radius: 26,
      },
    ],
  },
  {
    id: "winslow_still",
    name: "Winslow Still-Yard",
    countyZone: "Patoka Township",
    township: "Old Winslow–Stendal Road",
    description: "Mash barrels, a two-stroke saw, and the last workbench that still has light. Dawn comes over the ridge if you can keep the fire lit.",
    mapWidth: 2100,
    mapHeight: 1800,
    ambientLight: 0.18,
    weather: "fog",
    fogDensity: 0.38,
    ground: "#1b1812",
    trail: "#2c2418",
    workbench: { x: 1020, y: 1040 },
    extract: { x: 1340, y: 980, radius: 90 },
    spawn: { x: 1100, y: 1140 },
    obstacles: [
      { x: 920, y: 720, width: 200, height: 140, type: "still", label: "SILAS'S STILL" },
      { x: 640, y: 860, width: 170, height: 120, type: "barn", label: "FEED BARN" },
      { x: 1280, y: 880, width: 130, height: 72, type: "pickup_truck", color: "#682d24" },
      { x: 1000, y: 1020, width: 56, height: 40, type: "workbench", label: "GUNSMITH" },
      { x: 520, y: 560, width: 62, height: 62, type: "tree" },
      { x: 1580, y: 540, width: 66, height: 66, type: "tree" },
      { x: 460, y: 1240, width: 70, height: 70, type: "tree" },
      { x: 1640, y: 1280, width: 64, height: 64, type: "tree" },
      { x: 1140, y: 1260, width: 50, height: 44, type: "crate" },
      { x: 780, y: 1100, width: 48, height: 42, type: "crate" },
    ],
    barrels: [
      { x: 860, y: 800 },
      { x: 1180, y: 790 },
      { x: 730, y: 980 },
      { x: 1400, y: 680 },
    ],
    lights: [
      { x: 1020, y: 780, radius: 130, intensity: 0.9 },
      { x: 720, y: 900, radius: 80, intensity: 0.55 },
    ],
    barricades: [
      { x: 860, y: 880, width: 100, height: 16, type: "wood_fence" },
      { x: 1080, y: 880, width: 100, height: 16, type: "wood_fence" },
      { x: 900, y: 1080, width: 90, height: 16, type: "sandbags" },
    ],
    loreNotes: [
      {
        id: "note_silas",
        locationId: "winslow_still",
        title: "Silas Boyd's Last Journal",
        author: "Silas Boyd, moonshiner",
        date: "October 24, 1983",
        content: [
          "Boyds have been on this township roll since the first entries. I will not leave the still to them.",
          "The well went to sulfur three weeks before the dead clawed the loam.",
          "Don't aim for the chest. Ribs are brittle. The jaw don't stop till the skull splits clean open.",
        ],
        x: 1020,
        y: 800,
        radius: 26,
      },
      {
        id: "note_augusta_road",
        locationId: "winslow_still",
        title: "Note on the Stendal Road",
        author: "Unknown survivor",
        date: "Unknown",
        content: [
          "Old Winslow–Stendal Road still follows the Indian trace along the ridge. Augusta is dark.",
          "If you have high-proof mash, you have a weapon. If you have dawn, you have a county.",
          "Ring the bell if you live. Tell them a Boyd held the yard.",
        ],
        x: 1320,
        y: 900,
        radius: 26,
      },
    ],
  },
  {
    id: "honey_springs",
    name: "Honey Springs",
    countyZone: "Monroe Township",
    township: "Spurgeon · south bank",
    description:
      "The springs at Spurgeon, and the stories already old in the 1700s. Harrison sent thirty riders to hold this side of the Patoka. The 1817 commission turned back in the weather and never finished looking.",
    mapWidth: 1900,
    mapHeight: 1700,
    ambientLight: 0.2,
    weather: "mist",
    fogDensity: 0.48,
    ground: "#17160f",
    trail: "#2a2416",
    workbench: { x: 940, y: 980 },
    extract: { x: 1380, y: 780, radius: 72 },
    spawn: { x: 980, y: 900 },
    lantern: { x: 1040, y: 740 },
    holes: [
      { x: 680, y: 1120, kind: "cellar" },
      { x: 1240, y: 1160, kind: "pit" },
    ],
    obstacles: [
      { x: 860, y: 640, width: 190, height: 120, type: "cabin", label: "SPURGEON STORE" },
      { x: 1140, y: 560, width: 78, height: 58, type: "spring", label: "HONEY SPRINGS" },
      { x: 1320, y: 760, width: 124, height: 68, type: "pickup_truck", color: "#4a3224" },
      { x: 920, y: 960, width: 56, height: 40, type: "workbench", label: "PORCH" },
      { x: 480, y: 520, width: 60, height: 60, type: "tree" },
      { x: 1500, y: 480, width: 66, height: 66, type: "tree" },
      { x: 420, y: 1240, width: 68, height: 68, type: "tree" },
      { x: 1560, y: 1220, width: 62, height: 62, type: "tree" },
      { x: 700, y: 860, width: 54, height: 46, type: "rock" },
      { x: 1180, y: 1080, width: 48, height: 42, type: "crate" },
    ],
    barrels: [
      { x: 820, y: 760 },
      { x: 1100, y: 720 },
      { x: 1280, y: 900 },
      { x: 760, y: 1040 },
    ],
    lights: [
      { x: 940, y: 680, radius: 110, intensity: 0.8 },
      { x: 1160, y: 580, radius: 80, intensity: 0.55 },
    ],
    barricades: [
      { x: 820, y: 780, width: 90, height: 16, type: "wood_fence" },
      { x: 1080, y: 780, width: 90, height: 16, type: "wood_fence" },
    ],
    loreNotes: [
      {
        id: "note_harrison_riders",
        locationId: "honey_springs",
        title: "Patrol Roll, Yellow Banks",
        author: "A rider under General Harrison",
        date: "copied, undated",
        content: [
          "Thirty mounted men were sent to keep the traces and the fords. The south bank of the Patoka was already full of stories older than the county.",
          "We watered at Honey Springs and did not stay the night. The horses would not drink the second time.",
          "If the spring tastes of honey and then of iron, leave the store. Do not go into the cellar.",
        ],
        x: 980,
        y: 760,
        radius: 26,
      },
      {
        id: "note_1817_commission",
        locationId: "honey_springs",
        title: "Seat of Justice, Unfinished",
        author: "Clerk's copy",
        date: "February 1817",
        content: [
          "On the fifteenth, Col. Hargrove and the commissioners fixed the seat at Petersburg. Weather turned them back before they could walk this side of the river.",
          "Spurgeon grew up later around the springs. The ground they skipped is the ground that is walking now.",
          "Board the holes. The commission never looked down them.",
        ],
        x: 1260,
        y: 860,
        radius: 26,
      },
    ],
  },
];

export const OUTBREAK_ORDER = [
  "white_oak_springs",
  "mccords_ford",
  "stendal_backbone",
  "petersburg_square",
  "winslow_still",
] as const;

export const OUTBREAK_WAVES_PER_MAP = 3;
export const OUTBREAK_FINAL_WAVES = 5;
export const BOARD_COST = 25;

export function locationIndexById(id: string): number {
  const i = GAME_LOCATIONS.findIndex((l) => l.id === id);
  return i < 0 ? 0 : i;
}

export interface EvolutionRecipe {
  baseWeapon: string;
  requiredBoon: string;
  requiredBoonName: string;
  requiredStacks: number;
  evolvedName: string;
  evolvedDescription: string;
  evolvedRadio: string;
  // Per-recipe stat transforms (defaults match the original Deadeye).
  dmgMul?: number;
  fireMul?: number;
  pierceSet?: number;
  magMul?: number;
  pelletsAdd?: number;
  spreadMul?: number;
  projSpeedMul?: number;
  rangeMul?: number;
  // Batch 6 (S16): paired filler requirement — evolution also needs N picks
  // of a named filler boon (one that isn't this row's requiredBoon).
  requiredPicks?: { boonId: string; count: number };
  // Batch 6 (S6): evolved-form signature bonuses — fractions, all optional
  // so old rows still evolve exactly as before when a field is absent.
  /** +10% crit chance on the evolved weapon, e.g. 0.10. */
  critBonus?: number;
  /** +10% damage on the evolved weapon, e.g. 0.10. */
  dmgBonus?: number;
  /** 5% faster cooldown on the evolved weapon, e.g. 0.05. */
  cdBonus?: number;
}

export const EVOLUTIONS: EvolutionRecipe[] = [
  {
    baseWeapon: "revolver",
    requiredBoon: "storm",
    requiredBoonName: "Storm jar",
    requiredStacks: 1,
    requiredPicks: { boonId: "lead", count: 3 }, // hand-loads for the magnum
    evolvedName: ".357 Deadeye",
    evolvedDescription: "Evolved in a chest: storm-forged .357. Hits 70% harder, cycles faster, punches through three deep.",
    evolvedRadio: "That hand-cannon drank the lightning. Deadeye now — and it don't miss twice.",
    critBonus: 0.10, // Deadeye: +10% crit chance
    dmgBonus: 0.10,  // Deadeye: +10% damage
  },
  {
    baseWeapon: "shotgun",
    requiredBoon: "bone",
    requiredBoonName: "Buck and bone",
    requiredStacks: 2,
    requiredPicks: { boonId: "shells", count: 3 }, // box off the bench feeds the bell
    evolvedName: "Widow's Bell",
    evolvedDescription: "Evolved: the '90 tornado took the Whiteoak chapel bell — this rings like it. Two more pellets, meaner and wider.",
    evolvedRadio: "She tolls for them now. The Widow's Bell don't need a steeple.",
    dmgMul: 1.5, fireMul: 1.15, pelletsAdd: 2, spreadMul: 1.25,
    dmgBonus: 0.10, // Bell: +10% damage, straight boom
  },
  {
    baseWeapon: "lever_rifle",
    requiredBoon: "salt",
    requiredBoonName: "Salt line",
    requiredStacks: 2,
    requiredPicks: { boonId: "beam", count: 3 }, // hunter's light for a longrifle
    evolvedName: "White Oak Longrifle",
    evolvedDescription: "Evolved: blessed salt down a White Oak barrel. Punches through five deep, faster and truer.",
    evolvedRadio: "One shot, clean through the tree line. That's a White Oak longrifle, boy.",
    dmgMul: 1.8, fireMul: 1.1, pierceSet: 5, projSpeedMul: 1.4,
    critBonus: 0.10, // Longrifle: +10% crit chance — one shot, one kill
    dmgBonus: 0.10,  // Longrifle: +10% damage
  },
  {
    baseWeapon: "carbine",
    requiredBoon: "trigger",
    requiredBoonName: "Filed trigger",
    requiredStacks: 2,
    requiredPicks: { boonId: "stride", count: 3 }, // run-and-gun pace for the rapid gun
    evolvedName: "Enos Corner Repeater",
    evolvedDescription: "Evolved: filed trigger on a Patoka carbine. Twice the cycle, half again the magazine.",
    evolvedRadio: "Enos Corner never heard anything that fast that wasn't weather.",
    dmgMul: 1.2, fireMul: 2.0, magMul: 1.5,
    cdBonus: 0.05,  // Repeater: 5% faster cooldown
    dmgBonus: 0.10, // Repeater: +10% damage
  },
  {
    baseWeapon: "crossbow",
    requiredBoon: "hide",
    requiredBoonName: "County hide",
    requiredStacks: 2,
    requiredPicks: { boonId: "pipe", count: 3 }, // traps for the silent hunter
    evolvedName: "Buffalo Trace Stalker",
    evolvedDescription: "Evolved: county hide wraps a Buffalo Trace bow. Twice the bite, faster bolts, quiet as snowfall.",
    evolvedRadio: "They never heard the Trace coming. That's how the old ones hunted.",
    dmgMul: 2.0, fireMul: 1.2, pierceSet: 3, projSpeedMul: 1.5,
    dmgBonus: 0.10, // Stalker: +10% damage
    cdBonus: 0.05,  // Stalker: 5% faster cooldown — quicker reload of the string
  },
  {
    baseWeapon: "chainsaw",
    requiredBoon: "jug",
    requiredBoonName: "Another jug",
    requiredStacks: 2,
    requiredPicks: { boonId: "leavings", count: 3 }, // scrap for the fuel bill
    evolvedName: "Kindill Ripper",
    evolvedDescription: "Evolved: a Kindill saw mill chain drinking moonshine. Bigger bite, longer reach.",
    evolvedRadio: "You can hear that ripper from Logtown. Feed it.",
    dmgMul: 1.6, fireMul: 1.25, rangeMul: 1.5,
    dmgBonus: 0.10, // Ripper: +10% damage
    cdBonus: 0.05,  // Ripper: 5% faster cooldown — hotter chain, faster spin
  },
];

// VS-2: weapon-family support affinities. Two or more unlocked weapons in a
// family (an evolved weapon counts as two) gives every family weapon +12% damage.
export const WEAPON_FAMILIES: Record<string, { name: string; members: string[]; blurb: string }> = {
  iron: { name: "Iron & Oak", members: ["revolver", "lever_rifle"], blurb: "Wheelguns and levers — the old iron of Pike County." },
  scatter: { name: "Barn Burner", members: ["shotgun"], blurb: "One barn gun, perfected." },
  rapid: { name: "Patoka Rapid", members: ["carbine"], blurb: "One fast gun, perfected." },
  silent: { name: "Trace Hunter", members: ["crossbow"], blurb: "One quiet bow, perfected." },
  heavy: { name: "Mill Saw", members: ["chainsaw"], blurb: "One loud saw, perfected." },
};

export interface WaveWindowDef {
  id: string;
  name: string;
  waveStart: number;
  waveEnd: number; // inclusive; 999 = endless
  blurb: string;
}

// VS-2: data-driven named wave windows — the visible run schedule.
export const WAVE_WINDOWS: WaveWindowDef[] = [
  { id: "dusk", name: "Dusk Settles", waveStart: 1, waveEnd: 2, blurb: "The county goes quiet. Then it doesn't." },
  { id: "golden", name: "Golden Swarm", waveStart: 3, waveEnd: 3, blurb: "The creek bed glitters — double grit for the wave." },
  { id: "howl", name: "The Trace Howls", waveStart: 4, waveEnd: 5, blurb: "Fast ones on the Buffalo Trace. Keep moving." },
  { id: "blood", name: "Blood Moon", waveStart: 6, waveEnd: 6, blurb: "Red moon over the county. Faster, meaner, double XP." },
  { id: "hartwell", name: "The Hartwell Shift", waveStart: 7, waveEnd: 9, blurb: "The shift change at the mines. They come in waves." },
  { id: "damp", name: "Black Damp", waveStart: 10, waveEnd: 12, blurb: "Bad air from the old shafts. Heavies in the dark." },
  { id: "ben", name: "Old Ben Wakes", waveStart: 13, waveEnd: 999, blurb: "Old Ben don't sleep no more. Endless." },
];

export interface RunEventDef {
  id: string;
  trigger: { type: "wave"; wave: number } | { type: "time"; seconds: number };
  durationSec: number;
  modifiers: { gritMult?: number; enemySpeedMult?: number; enemyHpMult?: number; xpMult?: number };
  banner: string;
  radio: string;
}

export const RUN_EVENTS: RunEventDef[] = [
  {
    id: "golden_swarm",
    trigger: { type: "wave", wave: 3 },
    durationSec: 60,
    modifiers: { gritMult: 2 },
    banner: "GOLDEN SWARM",
    radio: "The creek bed's glittering, friend. Every husk drops double grit for a minute.",
  },
  {
    id: "blood_moon",
    trigger: { type: "wave", wave: 6 },
    durationSec: 90,
    modifiers: { enemySpeedMult: 1.5, enemyHpMult: 1.5, xpMult: 2 },
    banner: "BLOOD MOON",
    radio: "Moon's gone red over the Trace. They're faster and meaner — but every kill feeds you double.",
  },
];

export const GRIT_GROUND_CAP = 50;
export const BOMB_RADIUS = 260;
export const BOMB_DMG = 150;
export const BOMB_MAX_CHARGES = 2;
export const BOMB_REGEN_MS = 45000;

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  stat: "kills" | "headshots" | "wavesCleared" | "chestsOpened" | "shrinesAttuned";
  goal: number;
  bonus: string;
}

// County Record: lifetime quests. Completed quests grant permanent run bonuses.
export const QUESTS: QuestDef[] = [
  { id: "first_blood", name: "First Blood", desc: "Kill 150 zombies (all time)", stat: "kills", goal: 150, bonus: "+5% damage, every run" },
  { id: "deadeye", name: "Deadeye", desc: "Land 75 headshots (all time)", stat: "headshots", goal: 75, bonus: "+8% damage, every run" },
  { id: "homesteader", name: "Homesteader", desc: "Clear 25 waves (all time)", stat: "wavesCleared", goal: 25, bonus: "+15 max HP, every run" },
  { id: "relic_hunter", name: "Relic Hunter", desc: "Open 8 supply chests (all time)", stat: "chestsOpened", goal: 8, bonus: "+40 starting scrap, every run" },
  { id: "tracebound", name: "Tracebound", desc: "Attune 6 shrines (all time)", stat: "shrinesAttuned", goal: 6, bonus: "+5% move speed, every run" },
  { id: "exterminator", name: "Exterminator", desc: "Kill 800 zombies (all time)", stat: "kills", goal: 800, bonus: "+10% damage, every run" },
];

export const SHRINE_COUNT = 2;
export const SHRINE_BOSS_DMG_PER = 0.12; // +12% damage vs elites/behemoth per attuned shrine

export interface ShopOfferDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  kind: "heal" | "ammo" | "maxhp" | "molotov" | "flare" | "firerate" | "dmg" | "speed" | "magnet" | "unlock" | "bombcharge";
  weaponId?: string;
  repeatable: boolean;
}

// Brotato-style between-wave shop pool. Costs scale with wave.
export const SHOP_POOL: ShopOfferDef[] = [
  { id: "shop_heal", name: "Patch Up", desc: "Restore 50 HP", baseCost: 35, kind: "heal", repeatable: true },
  { id: "shop_ammo", name: "Ammo Cache", desc: "Refill all reserves", baseCost: 40, kind: "ammo", repeatable: true },
  { id: "shop_flare", name: "Road Flare", desc: "+1 flare", baseCost: 30, kind: "flare", repeatable: true },
  { id: "shop_molotov", name: "Moonshine Bomb", desc: "+1 molotov", baseCost: 50, kind: "molotov", repeatable: true },
  { id: "shop_bombcharge", name: "Powder Keg", desc: "+1 bomb charge", baseCost: 100, kind: "bombcharge", repeatable: true },
  { id: "shop_maxhp", name: "Iron Rations", desc: "+25 max HP", baseCost: 60, kind: "maxhp", repeatable: true },
  { id: "shop_dmg", name: "Hot Loads", desc: "+8% damage", baseCost: 90, kind: "dmg", repeatable: true },
  { id: "shop_firerate", name: "Trigger Job", desc: "+8% fire rate", baseCost: 80, kind: "firerate", repeatable: true },
  { id: "shop_speed", name: "Light Boots", desc: "+6% move speed", baseCost: 70, kind: "speed", repeatable: true },
  { id: "shop_magnet", name: "Grit Magnet", desc: "+30% pickup radius", baseCost: 55, kind: "magnet", repeatable: true },
  { id: "shop_unlock_shotgun", name: "Scattergun", desc: "Unlock the shotgun", baseCost: 150, kind: "unlock", weaponId: "shotgun", repeatable: false },
  { id: "shop_unlock_carbine", name: "Carbine", desc: "Unlock the carbine", baseCost: 120, kind: "unlock", weaponId: "carbine", repeatable: false },
  { id: "shop_unlock_crossbow", name: "Crossbow", desc: "Unlock the crossbow", baseCost: 140, kind: "unlock", weaponId: "crossbow", repeatable: false },
];

export const SHOP_OFFER_COUNT = 4;
export const SHOP_REROLL_BASE = 15;

// ---------------------------------------------------------------------------
// Batch 4 (Lane B): per-level weapon stat tables + Konami secret weapon.
//
// WEAPON_LEVELS: 5-level stat arrays per weapon id, neon-swarm WDEFS style.
//   dmg -> Weapon.damage, cnt -> Weapon.pellets, rad -> Weapon.range,
//   spd -> Weapon.bulletSpeed, cd -> 1 / Weapon.fireRate (seconds per shot).
// Level 1 of each row matches that weapon's INITIAL_WEAPONS base stats.
//
// ENGINE INTEGRATION POINT (coordinator): the buried level-up math lives in
//   upgradeWeaponOnce(w) in src/game/engine.ts (~line 3520, Batch-3 block):
//     if (!w || w.upgradeLevel >= 8) return false;
//     w.upgradeLevel++;
//     w.damage = Math.round(w.damage * 1.2);
//     w.magazineSize = Math.round(w.magazineSize * 1.15);
//     w.currentMag = w.magazineSize;
// Replace the body so a level-up applies statsForLevel(w.id, w.upgradeLevel)
// (dmg->damage, cnt->pellets, rad->range, spd->bulletSpeed, fireRate=1/cd).
// NOTE: the engine currently caps at level 8 but this table has 5 levels —
// either lower the >= 8 guard to >= 5 or extend the rows below to 8.
// ---------------------------------------------------------------------------

export interface WeaponLevelStats {
  dmg: number;
  cnt: number;
  rad: number;
  spd: number;
  cd: number;
}

interface WeaponLevelRow {
  dmg: number[];
  cnt: number[];
  rad: number[];
  spd: number[];
  cd: number[];
}

export const WEAPON_LEVELS: Record<string, WeaponLevelRow> = {
  revolver:    { dmg: [65, 78, 92, 108, 128],  cnt: [1, 1, 1, 1, 1],   rad: [650, 650, 680, 700, 720], spd: [16, 16.5, 17, 17.5, 18], cd: [0.45, 0.42, 0.39, 0.36, 0.33] },
  shotgun:     { dmg: [26, 30, 35, 40, 46],    cnt: [8, 8, 9, 10, 12], rad: [420, 430, 440, 450, 460], spd: [13, 13.5, 14, 14.5, 15], cd: [0.95, 0.9, 0.85, 0.8, 0.75] },
  lever_rifle: { dmg: [140, 165, 195, 230, 275], cnt: [1, 1, 1, 1, 2], rad: [900, 920, 940, 960, 980], spd: [22, 23, 24, 25, 26],     cd: [0.71, 0.67, 0.63, 0.59, 0.55] },
  carbine:     { dmg: [42, 48, 55, 63, 72],    cnt: [1, 1, 1, 2, 2],   rad: [750, 760, 770, 780, 800], spd: [19, 19.5, 20, 20.5, 21], cd: [0.13, 0.125, 0.12, 0.115, 0.11] },
  crossbow:    { dmg: [180, 215, 255, 300, 360], cnt: [1, 1, 1, 1, 2], rad: [850, 870, 890, 910, 940], spd: [18, 18.5, 19, 19.5, 20], cd: [1.11, 1.05, 1.0, 0.95, 0.9] },
  chainsaw:    { dmg: [35, 40, 46, 53, 62],    cnt: [1, 1, 1, 1, 1],   rad: [95, 100, 105, 110, 120],  spd: [12, 12, 12, 12, 12],     cd: [0.083, 0.08, 0.077, 0.074, 0.07] },
  wompus_howler: { dmg: [120, 140, 165, 195, 230], cnt: [3, 3, 4, 4, 5], rad: [700, 720, 740, 760, 780], spd: [20, 20.5, 21, 21.5, 22], cd: [0.167, 0.158, 0.15, 0.142, 0.133] },
};

export const WEAPON_MAX_TABLE_LEVEL = 5;

export function statsForLevel(id: string, level: number): WeaponLevelStats | null {
  const row = WEAPON_LEVELS[id];
  if (!row) return null;
  const i = Math.max(0, Math.min(WEAPON_MAX_TABLE_LEVEL - 1, Math.floor(level) - 1));
  return { dmg: row.dmg[i], cnt: row.cnt[i], rad: row.rad[i], spd: row.spd[i], cd: row.cd[i] };
}

// ---------------------------------------------------------------------------
// Konami-code secret weapon: the Wompus Howler.
//
// Pike County reskin of the "retro blaster" trope: a Winslow gunsmith bored
// out a carbine and tuned the report to yowl like the Winslow Wompus Cat.
// Hidden from every draft — earned only via the Konami code.
//
// ENGINE INTEGRATION POINT (coordinator): the key handler is
//   handleKeyDown = (e) => {...} in src/game/engine.ts (line 871).
// Add, at the TOP of the handler (before the draft Digit1-3 early return so
// the code also works on the title / game-over screens):
//   this.konamiBuf = [...(this.konamiBuf ?? []), e.code].slice(-10);
//   if (matchKonami(this.konamiBuf) && !this.weapons.some((w) => w.id === "wompus_howler")) {
//     this.weapons.push(JSON.parse(JSON.stringify(SECRET_WEAPON)));
//     this.konamiBuf = [];
//     this.spawnFloater(this.player.x, this.player.y - 56, "WOMPUS HOWLER UNLOCKED", "#c77dff");
//     this.callbacks.onRadio?.("Unknown", "Thirty years the Wompus cat yowled on the ridge. Now it yowls through your barrel.");
//   }
// e.code values are the DOM KeyboardEvent codes (ArrowUp, KeyB, KeyA, ...).
// ---------------------------------------------------------------------------

export const KONAMI_SEQUENCE: string[] = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "KeyB", "KeyA",
];

// True when the tail of the recent-key buffer equals the Konami sequence.
export function matchKonami(recentKeys: string[]): boolean {
  if (recentKeys.length < KONAMI_SEQUENCE.length) return false;
  const tail = recentKeys.slice(recentKeys.length - KONAMI_SEQUENCE.length);
  return KONAMI_SEQUENCE.every((code, i) => tail[i] === code);
}

export const SECRET_WEAPON: Weapon = {
  id: "wompus_howler",
  name: "Wompus Howler",
  category: "Secret",
  description: "A Winslow gunsmith's joke that stopped being funny: a carbine bored out and tuned to yowl like the Wompus cat on every pull. The dead hear it coming and come anyway.",
  damage: 120,
  fireRate: 6,
  pellets: 3,
  spread: 0.18,
  range: 700,
  bulletSpeed: 20,
  magazineSize: 24,
  currentMag: 24,
  reserveAmmo: 60,
  maxReserveAmmo: 120,
  reloadTime: 1700,
  pierce: 2,
  soundType: "carbine",
  unlocked: true,
  cost: 0,
  upgradeLevel: 1,
};

// ---------------------------------------------------------------------------
// Batch 5 — Lane C (data/meta): BOSSES table + seeded RNG.
//
// S6 "bosses as data": boss definitions live here as pure data so the engine
// can stop hardcoding the Behemoth. The `behemoth` row is the BASELINE row —
// its numbers were copied verbatim from engine.ts (see ENGINE INTEGRATION
// POINT below), so a data-driven spawn of "behemoth" behaves identically to
// today's hardcoded one. The other two rows are FUTURE bosses (not wired to
// the engine yet); their ids were added to the ZombieType union additively.
//
// ENGINE INTEGRATION POINT (coordinator): today the Behemoth is spawned in
//   spawnZombie() in src/game/engine.ts (~line 2906, as of d55addb):
//     else if (this.wave >= 5 && this.wave % 5 == 0 && this.zombiesToSpawn === 1) a = `behemoth`;
//   whose stats are set in the pushZombie() ternary (~line 2917):
//     e === `behemoth` && (r = 1400 + this.wave * 250, i = 1.55, a = 45, o = 38, s = `#581c87`, l = 1500, u = 250);
//   plus the bossEntrance() ceremony (~line 3620): banner "THE BEHEMOTH" /
//   "Something old is walking out of the treeline", trauma +0.45, WJPS radio
//   line "Folks... we got a big one on the Trace.", and the "COUNTY LEGEND"
//   death floater (~line 3559). A data-driven spawn should read the row via
//   bossFor("behemoth"), apply bossOverrides (health: 1400 + wave*250 — the
//   engine adds the wave term, so the table stores the BASE), and route
//   spawnRule timing through a scheduler that fires when wave%5==0 waves
//   begin. Debug probes that already spawn behemoths directly: bossBanner
//   (~line 550: this.pushZombie(`behemoth`, ...)) and bossMul (~line 445).
// ---------------------------------------------------------------------------

export interface BossOverrides {
  /** Base maxHealth. Engine adds the per-wave term on top (behemoth: +wave*250). */
  health: number;
  speed: number;
  damage: number;
  radius: number;
  color: string;
  scoreValue: number;
  scrapValue: number;
  bannerText: string;
  bannerSub: string;
}

export interface BossDef {
  id: string;
  /** Zombie type pushed into the sim via pushZombie(). */
  type: ZombieType;
  name: string;
  /** Seconds into a run when this boss becomes eligible (0 = not timer-gated;
   *  behemoth keeps its legacy wave rule instead — see spawnRule). */
  spawnAt: number;
  /** Engine-mapped id of the boss's signature trick. */
  signatureAbility: string;
  /** Human-readable spawn condition (documents the hardcoded rule replaced). */
  spawnRule: string;
  bossOverrides: BossOverrides;
}

export const BOSSES: BossDef[] = [
  {
    // BASELINE row — mirrors the current hardcoded Behemoth exactly.
    id: "behemoth",
    type: "behemoth",
    name: "The Behemoth",
    spawnAt: 0, // legacy wave rule, not a timer: see spawnRule
    signatureAbility: "county_legend",
    spawnRule: "wave >= 5 && wave % 5 == 0 && zombiesToSpawn === 1 (spawnZombie picker)",
    bossOverrides: {
      health: 1400, // engine adds +wave*250 on top (excluded from +7%/wave HP scaling)
      speed: 1.55,
      damage: 45,
      radius: 38,
      color: "#581c87",
      scoreValue: 1500,
      scrapValue: 250,
      bannerText: "THE BEHEMOTH",
      bannerSub: "Something old is walking out of the treeline",
    },
  },
  {
    // Future boss 1: coal-country flavor — a "tipple" is the coal-loading
    // structure that dotted Indiana mining towns. Never wired to the engine.
    id: "tipple",
    type: "tipple_brute",
    name: "The Tipple Brute",
    spawnAt: 480,
    signatureAbility: "tipple_slam", // ground slam: radial knockback + dust ring
    spawnRule: "run time >= 480s (future boss scheduler; not wired yet)",
    bossOverrides: {
      health: 2600,
      speed: 1.1,
      damage: 60,
      radius: 44,
      color: "#7c2d12",
      scoreValue: 2200,
      scrapValue: 320,
      bannerText: "THE TIPPLE BRUTE",
      bannerSub: "The tipple fell a long time ago. Something climbed out.",
    },
  },
  {
    // Future boss 2: the Wompus cat is already Pike County folklore
    // (see the wompus_howler secret weapon, Batch 4). Never wired to the engine.
    id: "wompus",
    type: "wompus_stalker",
    name: "The Wompus Stalker",
    spawnAt: 780,
    signatureAbility: "wompus_yowl", // yowl: brief speed burst + drags a sprinter pack in
    spawnRule: "run time >= 780s (future boss scheduler; not wired yet)",
    bossOverrides: {
      health: 2200,
      speed: 2.6,
      damage: 38,
      radius: 30,
      color: "#365314",
      scoreValue: 2600,
      scrapValue: 380,
      bannerText: "THE WOMPUS STALKER",
      bannerSub: "You hear it before you see it. Then you hear nothing at all.",
    },
  },
];

export function bossFor(id: string): BossDef | undefined {
  return BOSSES.find((b) => b.id === id);
}

// ---------------------------------------------------------------------------
// Seeded RNG (S16 daily challenge). Canonical export — the private copy inside
// src/game/mapRenderer.ts keeps working untouched; this one is the public
// contract for gameplay seeding.
//
// DAILY CHALLENGE INTEGRATION POINT (coordinator):
//   - Title screen (src/routes/index.tsx): add a "Daily Run" button next to
//     "Start Run". It computes getDailySeed() (meta.ts), shows
//     dailyPlayed() state ("Played ✓"), and starts the engine with the seed.
//   - Engine: accept opts.seed and store this.rng = mulberry32(seed); replace
//     Math.random() calls that affect gameplay with this.rng() — the spawn
//     picker (~line 2904: `let a = `shambler`, o = Math.random();`), the
//     stat jitter in pushZombie (~line 2926: i * (.9 + Math.random() * .2),
//     id: Math.random().toString()), elite rolls (~line 2952), and drop rolls
//     (dropGritOrb etc.). Leave non-gameplay randomness (banner timing uses
//     Date.now(), cosmetic jitter) on Math.random so seeded runs only diverge
//     on gameplay, not UI chrome.
// ---------------------------------------------------------------------------

/** Canonical mulberry32 PRNG. Same seed -> identical sequence, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash -> uint32 seed. Same input -> same seed for everyone. */
export function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Batch 6 — Lane D (data/meta):
//   (a) evolutionReady() — S16 pure trigger check;
//   (b) CODEX — S16 achievement/codex table + lookup (Lane E builds UI on it);
//   (c) SCALING — S7 smooth time-based difficulty formulas + scalingAt().
//
// (a) EVOLUTION TRIGGER INTEGRATION POINT (coordinator): the gate lives in
//   checkEvolutions() in src/game/engine.ts (~line 2850). Today's condition is
//     if (!w || this.boon(r.requiredBoon) < r.requiredStacks) continue;
//   Replace it with the S16 trigger (max level + paired filler picks):
//     if (!evolutionReady(r, w, this.boonStacks)) continue;
//   When evolutionReady is true, apply the S6 signature bonuses alongside the
//   existing mults, right after the fireRate/pierce block (~line 2862-2869):
//     if (r.dmgBonus) w.damage = Math.round(w.damage * (1 + r.dmgBonus));        // +10% damage
//     if (r.critBonus) w.critChance = (w.critChance ?? 0) + r.critBonus;          // +10% crit — see note below
//     if (r.cdBonus) w.cooldown = (w.cooldown ?? 0) * (1 - r.cdBonus);           // 5% faster cooldown
//   CRIT NOTE: the engine has no per-weapon crit system yet — headshots are the
//   crit analog (×2.4, checkHeadshot ~line 2655). Either add a weapon critChance
//   roll in the damage pipeline (~line 2634) and map critBonus onto it, or fold
//   critBonus into the headshot multiplier for evolved weapons.
//   Remember the evolution-hints UI: evolutionHints() (~line 2880) should grow
//   the new "(filler have/need)" and "max level" bits when this is wired.
// ---------------------------------------------------------------------------

/**
 * Pure evolution trigger (S16). True only when ALL hold:
 *  - the weapon exists and is at max table level (WEAPON_MAX_TABLE_LEVEL),
 *  - the evolution's requiredBoon has the requiredStacks,
 *  - the paired filler picks requirement (requiredPicks, e.g. 3 picks) is met.
 * boonStacks is a plain Record<string, number> of boon id -> stack count.
 */
export function evolutionReady(
  row: EvolutionRecipe,
  weapon: { upgradeLevel: number } | undefined | null,
  boonStacks: Record<string, number>
): boolean {
  if (!weapon) return false;
  if (weapon.upgradeLevel < WEAPON_MAX_TABLE_LEVEL) return false;
  if ((boonStacks[row.requiredBoon] ?? 0) < row.requiredStacks) return false;
  if (row.requiredPicks && (boonStacks[row.requiredPicks.boonId] ?? 0) < row.requiredPicks.count) return false;
  return true;
}

// ---------------------------------------------------------------------------
// (b) CODEX — S16 achievement/codex table. Pure data; Lane E renders it.
//
// CONTRACT (Lane E): every entry is exactly { id, name, blurb, hint }.
//   - weapons: id === the Weapon.id (e.g. "revolver")
//   - evolutions: id === "evolution_<baseWeapon>" (e.g. "evolution_revolver")
//   - zombie types: id === the ZombieType string (e.g. "shambler")
//   - bosses: id === the BossDef.id ("behemoth" shares its entry with the
//     zombie-type row; "tipple" and "wompus" have their own)
//   - secrets: "konami" (Konami-code secret), "daily_challenge"
// blurb is lore/flavor; hint tells the player how to unlock or meet it.
// Do not rename the fields — the Codex UI is built against this shape.
// ---------------------------------------------------------------------------

export interface CodexEntry {
  id: string;
  name: string;
  blurb: string;
  hint: string;
}

export const CODEX: CodexEntry[] = [
  // --- weapons (id === Weapon.id) ---
  { id: "revolver", name: ".357 Trail Magnum", blurb: "Heavy Pike County revolver. One-handed thunder that still stops a shambler cold. Hand-loaded lead and a supply chest wake something up in it.", hint: "Start with it — it's your first gun." },
  { id: "shotgun", name: "12-Ga. Pump", blurb: "Barn gun. Turns a hallway of infected into Patoka mud. Eight pellets of Whiteoak thunder.", hint: "Unlock it in the wave shop or the workbench." },
  { id: "lever_rifle", name: "30-30 Lever Gun", blurb: "Deer rifle off a Washington Township porch. Drills through two, sometimes three.", hint: "Unlock it at the workbench or in a supply cache." },
  { id: "carbine", name: "Guard Carbine", blurb: "Pulled from an Indiana National Guard checkpoint on US-41 after the road went quiet.", hint: "Unlock it at the workbench or in a supply cache." },
  { id: "crossbow", name: "Silent Hunter", blurb: "Broadheads. No report. The horde does not turn unless they see the light.", hint: "Unlock it at the workbench or in a supply cache." },
  { id: "chainsaw", name: "Stihl Yard Saw", blurb: "Two-stroke from a barn loft. Eats fuel. Eats everything else faster.", hint: "Unlock it at the workbench or in a supply cache." },
  { id: "wompus_howler", name: "Wompus Howler", blurb: "A Winslow gunsmith's joke that stopped being funny: a carbine bored out and tuned to yowl like the Wompus cat on every pull.", hint: "Secret — enter the Konami code. It is never drafted." },

  // --- evolutions (id === "evolution_<baseWeapon>") ---
  { id: "evolution_revolver", name: ".357 Deadeye", blurb: "Storm-forged .357. Hits 70% harder, cycles faster, punches three deep — and the lightning taught it where to bite: +10% crit, +10% damage.", hint: "Max the revolver's level, take Storm jar, and draft 3 Hand-loaded lead picks." },
  { id: "evolution_shotgun", name: "Widow's Bell", blurb: "The '90 tornado took the Whiteoak chapel bell — this rings like it. Two more pellets, meaner and wider: +10% damage.", hint: "Max the shotgun's level, take 2 Buck and bone, and draft 3 Box off the bench picks." },
  { id: "evolution_lever_rifle", name: "White Oak Longrifle", blurb: "Blessed salt down a White Oak barrel. Punches five deep, faster and truer: +10% crit, +10% damage.", hint: "Max the lever rifle's level, take 2 Salt line, and draft 3 Fresh cells picks." },
  { id: "evolution_carbine", name: "Enos Corner Repeater", blurb: "Filed trigger on a Patoka carbine. Twice the cycle, half again the magazine: 5% faster cooldown, +10% damage.", hint: "Max the carbine's level, take 2 Filed trigger, and draft 3 Longer stride picks." },
  { id: "evolution_crossbow", name: "Buffalo Trace Stalker", blurb: "County hide wraps a Buffalo Trace bow. Twice the bite, faster bolts, quiet as snowfall: +10% damage, 5% faster cooldown.", hint: "Max the crossbow's level, take 2 County hide, and draft 3 Stovepipe picks." },
  { id: "evolution_chainsaw", name: "Kindill Ripper", blurb: "A Kindill saw-mill chain drinking moonshine. Bigger bite, longer reach: +10% damage, 5% faster cooldown.", hint: "Max the chainsaw's level, take 2 Another jug, and draft 3 Pocket the leavings picks." },

  // --- zombie types (id === ZombieType string) ---
  { id: "shambler", name: "Shambler", blurb: "The county's walking dead. Slow, patient, and always coming out of the holes.", hint: "Wave 1 onward. Board the holes." },
  { id: "sprinter", name: "Sprinter", blurb: "Fast ones on the Buffalo Trace. They don't wander — they hunt.", hint: "Shows up early. Keep moving; don't let them cut the corner." },
  { id: "crawler", name: "Crawler", blurb: "Claws out of the cellar holes and comes low. Easy to miss in the fog.", hint: "Watch the holes at White Oak Springs." },
  { id: "miner_brute", name: "Miner Brute", blurb: "A Stendal Backbone shaft man, still wearing his helmet and his shift. Hits like a roof bolt.", hint: "Mid-wave muscle. Helmets soak the first headshot." },
  { id: "bloater_spitter", name: "Bloater Spitter", blurb: "Swollen on Patoka water. Spits at range — the fog is its friend.", hint: "Keep distance; close the gap between spits." },
  { id: "riot_shield", name: "Riot Shield", blurb: "Deputy's barricade gear, still worn by the deputy. A wall with a grudge.", hint: "Flank it — the shield only faces forward." },
  { id: "behemoth", name: "The Behemoth", blurb: "Something old is walking out of the treeline. A county legend: every fifth wave, the ground shakes.", hint: "Boss — wave 5, 10, 15, ... Attune shrines for +12% boss damage each." },
  { id: "tipple_brute", name: "The Tipple Brute", blurb: "The tipple fell a long time ago. Something climbed out — and it remembers the slam.", hint: "Future boss. Not yet in the wild." },
  { id: "wompus_stalker", name: "The Wompus Stalker", blurb: "You hear it before you see it. Then you hear nothing at all.", hint: "Future boss. Not yet in the wild." },

  // --- bosses (id === BossDef.id; behemoth shares its zombie row above) ---
  { id: "tipple", name: "Boss: The Tipple Brute", blurb: "Coal-country nightmare out of the old tipple. Ground slam: radial knockback and a dust ring.", hint: "Future boss. Not yet in the wild." },
  { id: "wompus", name: "Boss: The Wompus Stalker", blurb: "The Winslow Wompus cat, grown wrong. Its yowl drags a sprinter pack in with it.", hint: "Future boss. Not yet in the wild." },

  // --- secrets ---
  { id: "konami", name: "Secret: The Konami Howl", blurb: "Thirty years the Wompus cat yowled on the ridge. The old code still wakes it.", hint: "Enter ↑↑↓↓←→←→ B A on the title screen." },
  { id: "daily_challenge", name: "Secret: Daily Challenge", blurb: "One seed, one county, every soul in Pike County gets the same draw.", hint: "Press Daily Run on the title screen — a new seed every day at local midnight." },
];

/** Codex lookup by id. Returns undefined for unknown ids. */
export function codexEntry(id: string): CodexEntry | undefined {
  return CODEX.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// (c) SCALING — S7 smooth time-based difficulty formulas. A legible
// alternative to per-wave step scaling: pure, evaluable data.
//
// SCALING formulas are arithmetic strings over `gt` (run time, seconds).
// Supported: numbers, `gt`, +, -, *, /, parentheses. scalingAt(gt) returns
// the { hp, speed, damage } multipliers for that moment of a run.
//
// ENGINE TUNING POINT (coordinator): today the per-wave step lives in
//   pushZombie() in src/game/engine.ts (~line 3004):
//     if (e !== `behemoth`) r = Math.round(r * (1 + Math.max(0, this.wave - 2) * .07));
//   (plus the Batch-4 D(t) timeCurve multiplying maxHealth at ~line 3015).
// A legible time-based alternative: at the top of pushZombie, do
//     const sc = scalingAt(this.simTime);
//     r = Math.round(r * sc.hp); i *= sc.speed; a *= sc.damage;
// and retire the wave step (or keep both and compare feel — they multiply).
// ---------------------------------------------------------------------------

export interface ScalingFormulas {
  hp: string;
  speed: string;
  damage: string;
}

export const SCALING: ScalingFormulas = {
  hp: "1+gt/120",
  speed: "1+gt/250",
  damage: "1+gt/300",
};

export interface ScalingMults {
  hp: number;
  speed: number;
  damage: number;
}

/**
 * Tiny safe evaluator for SCALING formula strings. Handles numbers, `gt`,
 * +, -, *, /, parentheses (shunting-yard). No eval() — the input is data.
 */
function evalScalingExpr(expr: string, gt: number): number {
  // Substitute gt, then normalize unary minus ("-3", "(-x)") to "0-3".
  const src = expr
    .replace(/\bgt\b/g, `(${gt})`)
    .replace(/(^|[(+\-*/])-/g, "$10-");
  const toks = src.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
  if (!toks) throw new Error(`bad scaling expr: ${expr}`);
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  for (const t of toks) {
    if (/^\d/.test(t)) out.push(parseFloat(t));
    else if (t in prec) {
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop() as string);
      ops.push(t);
    } else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop() as string);
      if (ops.pop() !== "(") throw new Error(`unbalanced parens in scaling expr: ${expr}`);
    } else throw new Error(`bad token in scaling expr: ${t}`);
  }
  while (ops.length) {
    const o = ops.pop() as string;
    if (o === "(") throw new Error(`unbalanced parens in scaling expr: ${expr}`);
    out.push(o);
  }
  const st: number[] = [];
  for (const t of out) {
    if (typeof t === "number") { st.push(t); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) throw new Error(`bad scaling expr: ${expr}`);
    st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : a / b);
  }
  if (st.length !== 1) throw new Error(`bad scaling expr: ${expr}`);
  return st[0];
}

/** Difficulty multipliers at run time gt (seconds): { hp, speed, damage }. */
export function scalingAt(gt: number): ScalingMults {
  return {
    hp: evalScalingExpr(SCALING.hp, gt),
    speed: evalScalingExpr(SCALING.speed, gt),
    damage: evalScalingExpr(SCALING.damage, gt),
  };
}
