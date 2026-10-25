import type { PassengerId } from "../dialogue/lines.ts";

export type StopKind = "pickup" | "dropoff";

export type MissionStop = {
  at: "willis" | "tribune" | "bean" | "union" | "pier" | "mart";
  kind: StopKind;
  /** Overrides the mission base on this drop. */
  base?: number;
};

export type Mission = {
  id: string;
  title: string;
  tagline: string;
  briefing: string;
  timeLimit: number;
  baseFare: number;
  passenger: PassengerId;
  fragile?: boolean;
  startChaos?: number;
  /** Police show up at this chaos instead of the usual 62. */
  heat?: number;
  handoff?: { atStop: number; passenger: PassengerId };
  stops: MissionStop[];
};

export const MISSIONS: Mission[] = [
  {
    id: "first-light",
    title: "First Light",
    tagline: "Bean to the trains. Don't show off. Much.",
    briefing:
      "Morning, ace. Lenny's at the Bean and he wants Union Station. Straight shot. Try not to introduce him to any buildings.",
    timeLimit: 170,
    baseFare: 120,
    passenger: "lenny",
    stops: [
      { at: "bean", kind: "pickup" },
      { at: "union", kind: "dropoff" },
    ],
  },
  {
    id: "late-pier",
    title: "Late to the Pier",
    tagline: "Tight clock. The ballpark is not the pier.",
    briefing:
      "Samir is late for a Cubs game, which is bold, because he is at the Mart and the ballpark is not Navy Pier. Get him there before the clock gets smug.",
    timeLimit: 150,
    baseFare: 180,
    passenger: "samir",
    stops: [
      { at: "mart", kind: "pickup" },
      { at: "pier", kind: "dropoff" },
    ],
  },
  {
    id: "glass-calm",
    title: "Glass and Calm",
    tagline: "Fragile VIP. Three hard hits and she walks.",
    briefing:
      "June Okonkwo. Union Station to Tribune Tower. She pays like a person who notices bumps. Three hard hits and she is out of the car and out of your night.",
    timeLimit: 220,
    baseFare: 240,
    passenger: "june",
    fragile: true,
    stops: [
      { at: "union", kind: "pickup" },
      { at: "tribune", kind: "dropoff" },
    ],
  },
  {
    id: "three-cornices",
    title: "Three Cornices",
    tagline: "One tour, three drops, a handoff.",
    briefing:
      "Ruthie wants the architecture tour. Mart, Tribune, the Bean, then the trains. Partway through, her colleague Priya takes the back seat. Keep the meter pretty.",
    timeLimit: 280,
    baseFare: 100,
    passenger: "ruthie",
    handoff: { atStop: 2, passenger: "priya" },
    stops: [
      { at: "mart", kind: "pickup" },
      { at: "tribune", kind: "dropoff", base: 100 },
      { at: "bean", kind: "dropoff", base: 130 },
      { at: "union", kind: "dropoff", base: 160 },
    ],
  },
  {
    id: "warden-weather",
    title: "Warden Weather",
    tagline: "Chaos starts warm. Don't feed it.",
    briefing:
      "Eddie at Navy Pier, drop at Willis Tower, and the wardens are already awake. Chaos starts warm. Don't feed it.",
    timeLimit: 200,
    baseFare: 260,
    passenger: "eddie",
    startChaos: 36,
    heat: 48,
    stops: [
      { at: "pier", kind: "pickup" },
      { at: "willis", kind: "dropoff" },
    ],
  },
];

export function missionById(id: string) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function unlocked(cleared: string[], index: number) {
  return index === 0 || cleared.includes(MISSIONS[index - 1].id);
}
