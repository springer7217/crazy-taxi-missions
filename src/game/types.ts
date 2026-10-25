export type Quality = "high" | "low";
export type TimeMode = "cycle" | "day" | "night";
export type SkinId = "steel" | "matte" | "gold";
export type ThrusterId = "cyan" | "amber" | "magenta" | "violet";

export type SaveData = {
  cash: number;
  engine: number;
  handling: number;
  jump: number;
  skin: SkinId;
  thruster: ThrusterId;
  skins: SkinId[];
  thrusters: ThrusterId[];
  cleared: string[];
  voice: boolean;
  muted: boolean;
  quality: Quality;
  timeMode: TimeMode;
};
