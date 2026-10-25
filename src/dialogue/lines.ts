export type PassengerId = "lenny" | "priya" | "samir" | "june" | "ruthie" | "eddie";

export type Passenger = {
  id: PassengerId;
  name: string;
  title: string;
  hue: string;
  lines: string[];
};

export const PASSENGERS: Record<PassengerId, Passenger> = {
  lenny: {
    id: "lenny",
    name: "Lenny Cho",
    title: "Tourist",
    hue: "#f0c14a",
    lines: [
      "Is that the Bean? It looks like my toaster, if my toaster paid rent.",
      "If we pass the river, I will take a photo and also maybe scream.",
      "You're very calm for a person driving a flying kettle.",
      "My cousin said the Chicago wind was a myth. My cousin lied.",
      "Union Station. I want to look like I meant to be this early.",
    ],
  },
  priya: {
    id: "priya",
    name: "Priya Shah",
    title: "Consultant",
    hue: "#8eb6ff",
    lines: [
      "Take the river route. The inland lights make me answer emails.",
      "I have a standup in eleven minutes and a soul in twelve.",
      "Smooth is fast. Fast and bumpy is just a meeting.",
      "If the wardens pull us over, I will bill them.",
      "Drop me where the door isn't a suggestion.",
    ],
  },
  samir: {
    id: "samir",
    name: "Samir Haddad",
    title: "Running late",
    hue: "#ff7a3c",
    lines: [
      "I'm late for a Cubs game and this city is very large about it.",
      "Take the river route! I want the dramatic entrance nobody asked for.",
      "Can the thrusters do a wave? Personal question. Sorry.",
      "My friend saved me a seat. My friend is a saint or a liar.",
      "That hop just fixed my whole personality.",
      "The pier is not the ballpark. I know. The ride still counts.",
    ],
  },
  june: {
    id: "june",
    name: "June Okonkwo",
    title: "VIP",
    hue: "#e7d7ff",
    lines: [
      "Quiet cabin, please. I am thinking expensive thoughts.",
      "I don't mind speed. I mind surprises.",
      "That corner was rude. Let's not invite it again.",
      "Tribune Tower, then I can pretend I am relaxed.",
      "If my composure levitates, we are doing it wrong. The car may.",
      "Smooth. I will remember this driver. That is a compliment.",
    ],
  },
  ruthie: {
    id: "ruthie",
    name: "Ruthie Pell",
    title: "Retired architect",
    hue: "#9dffce",
    lines: [
      "Look at that cornice. Somebody cared in 1928.",
      "The river is the only honest line in the Loop.",
      "Take the river route! The bridges do their best work from the water.",
      "Willis can see us. Try to look employed.",
      "I rode the old cabs. They didn't glow. I forgive them.",
      "Drop me gently. My knees filed a complaint years ago.",
    ],
  },
  eddie: {
    id: "eddie",
    name: "Eddie Morales",
    title: "Vendor emeritus",
    hue: "#ff8b6a",
    lines: [
      "Take the river route! The gulls and I have a treaty.",
      "I got a cooler full of nothing, but the vibe is fully stocked.",
      "You fly this pretty. Ever consider hot dogs? No. Stay with this.",
      "My cousin drives a bus. I am winning the reunion.",
      "Don't splash the lake. The lake remembers.",
      "Wardens behind us? Wave. It's a parade. A fast parade.",
    ],
  },
};

export const MARA = {
  name: "Mara Voss",
  pickup: [
    "They're in. Meter's live. Make it pretty.",
    "Door's shut. The clock is not your friend, but it can be talked to.",
  ],
  drop: [
    "That's a drop. Money's real. Don't get poetic yet.",
    "Clean handoff. I almost smiled. Don't tell the office.",
  ],
  lowTime: [
    "Timer's getting thin. I can hear you not blinking.",
    "Under ten is a personality test. Don't flunk it.",
  ],
  chaos: [
    "Chaos is climbing. The wardens get bored, then they get ideas.",
    "You're collecting attention. Attention invoices you.",
  ],
  fine: "Warden tap. That's a fine. Shake it off and drive.",
  air: "Nice hop. The fare felt that, in the good way.",
  tooHigh: "Set it down. They can't board a cloud.",
};

export function pickLine(pool: string[], salt: number) {
  return pool[Math.abs(salt) % pool.length] ?? pool[0];
}
