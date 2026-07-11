export const PlanLevels = {
  free: 1,
  regular: 2,
  vip: 3,
} as const;

export type PlanType = keyof typeof PlanLevels;