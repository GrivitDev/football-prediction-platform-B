export const PlanLevels = {
  free: 1,
  regular: 2,
  vip: 3,
  premium: 4,
} as const;

export type PlanType = keyof typeof PlanLevels;
