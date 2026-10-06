import {
  type BedWarsStats,
  type BedWarsKillsDeaths,
  type BedWarsCombatBreakdown,
  type BedWarsPracticeMode,
  type BedWarsBeds,
  type BedWarsResources,
} from "@breezil/hypixel-parsers";
import {
  bedwarsStar,
  bedwarsPrestige,
  bedwarsXpToNextLevel,
  type BedwarsPrestige,
  BEDWARS_PRESTIGES,
  BEDWARS_PRESTIGE_CYCLE_XP,
} from "../shared/leveling";
import {
  round2,
  ratio,
  percent,
  perGame,
  neededForNextWholeRatio,
} from "../shared/ratio";

type BedWarsDamageType = keyof BedWarsCombatBreakdown;

export type BedWarsKillRatios = Readonly<
  Record<BedWarsDamageType, { readonly ratio: number }>
>;

export type BedWarsFinalRatios = Readonly<
  Record<BedWarsDamageType, { readonly ratio: number; readonly share: number }>
>;

export interface BedWarsBedRatios {
  readonly ratio: number;
}

export interface BedWarsModeComputed {
  readonly winLossRatio: number;
  readonly winRate: number;
  readonly killsPerGame: number;
  readonly finalKillsPerGame: number;
  readonly bedsBrokenPerGame: number;
  readonly resourcesPerGame: number;
  readonly ironPerGame: number;
  readonly goldPerGame: number;
  readonly diamondPerGame: number;
  readonly emeraldPerGame: number;
  readonly itemsPurchasedPerGame: number;
  readonly finalKillParticipation: number;
  readonly finalsForNextFkdr: number;
  readonly killsForNextKdr: number;
  readonly winsForNextWlr: number;
  readonly bedsForNextBblr: number;
  readonly beds: BedWarsBedRatios;
  readonly kills: BedWarsKillRatios;
  readonly finals: BedWarsFinalRatios;
}

// Aggregates (core + dreams)
export interface BedWarsModeTotals {
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
  readonly beds: BedWarsBeds;
  readonly resources: BedWarsResources;
  readonly kills: BedWarsCombatBreakdown;
  readonly finals: BedWarsCombatBreakdown;
}

type NonEmptyModes = readonly [BedWarsModeTotals, ...BedWarsModeTotals[]];

/**
 * Raw counters and derived ratios side by side. `beds`, `kills` and `finals`
 * exist in both shapes, so they are merged into one object each.
 */
export interface BedWarsAggregateComputed extends Omit<
  BedWarsModeComputed,
  "beds" | "kills" | "finals"
> {
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
  readonly resources: BedWarsResources;
  readonly beds: BedWarsBeds & BedWarsBedRatios;
  readonly kills: Readonly<
    Record<BedWarsDamageType, BedWarsKillsDeaths & { readonly ratio: number }>
  >;
  readonly finals: Readonly<
    Record<
      BedWarsDamageType,
      BedWarsKillsDeaths & { readonly ratio: number; readonly share: number }
    >
  >;
}

export type BedWarsDream =
  | "armed"
  | "lucky"
  | "swap"
  | "underworld"
  | "voidless"
  | "totallyNormal"
  | "rush"
  | "ultimate"
  | "oneBlock";

export type BedWarsDreamsComputed = Readonly<
  Record<BedWarsDream, BedWarsAggregateComputed>
>;

export interface BedWarsPracticeModeComputed {
  readonly attempts: number;
  readonly successfulRatio: number;
}

export interface BedWarsPracticeComputed {
  readonly bridging: BedWarsPracticeModeComputed;
  readonly fireballJumping: BedWarsPracticeModeComputed;
  readonly mlg: BedWarsPracticeModeComputed;
  readonly pearlClutching: BedWarsPracticeModeComputed;
}

export type BedWarsSubmode =
  "solo" | "doubles" | "threes" | "fours" | "fourVsFour" | "castle";

export interface BedWarsComputed {
  readonly level: number;
  readonly prestige: BedwarsPrestige;
  readonly xpToNextLevel: number;
  readonly starsToNextPrestige: number;
  readonly xpForNextPrestige: number;
  readonly index: number;
  readonly finalsPerStar: number;
  readonly winsPerStar: number;
  readonly legendaryChestRate: number;
  readonly practice: BedWarsPracticeComputed;
  readonly overall: BedWarsModeComputed;
  readonly core: BedWarsAggregateComputed;
  readonly perMode: Readonly<Record<BedWarsSubmode, BedWarsModeComputed>>;
  readonly dreams: BedWarsDreamsComputed;
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function mapBreakdown<T>(
  breakdown: BedWarsCombatBreakdown,
  project: (entry: BedWarsKillsDeaths) => T,
): Readonly<Record<BedWarsDamageType, T>> {
  const result = {} as Record<BedWarsDamageType, T>;
  for (const type of Object.keys(breakdown) as BedWarsDamageType[]) {
    result[type] = project(breakdown[type]);
  }
  return result;
}

function computeMode(mode: BedWarsModeTotals): BedWarsModeComputed {
  const games = mode.gamesPlayed;
  const totalFinals = mode.finals.total;
  return {
    winLossRatio: ratio(mode.wins, mode.losses),
    winRate: ratio(mode.wins, games),
    killsPerGame: perGame(mode.kills.total.kills, games),
    finalKillsPerGame: perGame(totalFinals.kills, games),
    bedsBrokenPerGame: perGame(mode.beds.broken, games),
    resourcesPerGame: perGame(mode.resources.total, games),
    ironPerGame: perGame(mode.resources.iron, games),
    goldPerGame: perGame(mode.resources.gold, games),
    diamondPerGame: perGame(mode.resources.diamond, games),
    emeraldPerGame: perGame(mode.resources.emerald, games),
    itemsPurchasedPerGame: perGame(mode.resources.itemsPurchased, games),
    finalKillParticipation: ratio(
      totalFinals.kills,
      totalFinals.kills + totalFinals.deaths,
    ),
    finalsForNextFkdr: neededForNextWholeRatio(
      totalFinals.kills,
      totalFinals.deaths,
    ),
    killsForNextKdr: neededForNextWholeRatio(
      mode.kills.total.kills,
      mode.kills.total.deaths,
    ),
    winsForNextWlr: neededForNextWholeRatio(mode.wins, mode.losses),
    bedsForNextBblr: neededForNextWholeRatio(mode.beds.broken, mode.beds.lost),
    beds: { ratio: ratio(mode.beds.broken, mode.beds.lost) },
    kills: mapBreakdown(mode.kills, (entry) => ({
      ratio: ratio(entry.kills, entry.deaths),
    })),
    finals: mapBreakdown(mode.finals, (entry) => ({
      ratio: ratio(entry.kills, entry.deaths),
      share: percent(entry.kills, totalFinals.kills),
    })),
  };
}

function computePracticeMode(
  mode: BedWarsPracticeMode,
): BedWarsPracticeModeComputed {
  return {
    attempts: mode.successfulAttempts + mode.failedAttempts,
    successfulRatio: ratio(mode.successfulAttempts, mode.failedAttempts),
  };
}

function bedwarsStarsToNextPrestige(star: number): number {
  const next = BEDWARS_PRESTIGES.find((entry) => entry.level > star);
  return next ? round2(next.level - star) : 0;
}

const RESOURCE_KEYS = Object.keys({
  total: true,
  iron: true,
  gold: true,
  diamond: true,
  emerald: true,
  bed: true,
  wrappedPresent: true,
  itemsPurchased: true,
  itemsPurchasedLegacy: true,
  permanentItemsPurchased: true,
  permanentItemsPurchasedLegacy: true,
} satisfies Record<keyof BedWarsResources, true>) as (keyof BedWarsResources)[];

function sumBreakdowns(
  breakdowns: readonly BedWarsCombatBreakdown[],
): BedWarsCombatBreakdown {
  const result = {} as Record<BedWarsDamageType, BedWarsKillsDeaths>;
  for (const type of Object.keys(breakdowns[0]) as BedWarsDamageType[]) {
    result[type] = {
      kills: sumBy(breakdowns, (b) => b[type].kills),
      deaths: sumBy(breakdowns, (b) => b[type].deaths),
    };
  }
  return result;
}

export function aggregateModes(modes: NonEmptyModes): BedWarsModeTotals {
  const resources = {} as Record<keyof BedWarsResources, number>;
  for (const key of RESOURCE_KEYS) {
    resources[key] = sumBy(modes, (m) => m.resources[key]);
  }
  return {
    wins: sumBy(modes, (m) => m.wins),
    losses: sumBy(modes, (m) => m.losses),
    gamesPlayed: sumBy(modes, (m) => m.gamesPlayed),
    beds: {
      broken: sumBy(modes, (m) => m.beds.broken),
      lost: sumBy(modes, (m) => m.beds.lost),
    },
    resources,
    kills: sumBreakdowns(modes.map((m) => m.kills)),
    finals: sumBreakdowns(modes.map((m) => m.finals)),
  };
}

function mergeBreakdown<E extends object>(
  counts: BedWarsCombatBreakdown,
  derived: Readonly<Record<BedWarsDamageType, E>>,
): Readonly<Record<BedWarsDamageType, BedWarsKillsDeaths & E>> {
  const result = {} as Record<BedWarsDamageType, BedWarsKillsDeaths & E>;
  for (const type of Object.keys(counts) as BedWarsDamageType[]) {
    result[type] = { ...counts[type], ...derived[type] };
  }
  return result;
}

function computeAggregate(totals: BedWarsModeTotals): BedWarsAggregateComputed {
  const computed = computeMode(totals);
  return {
    ...computed,
    wins: totals.wins,
    losses: totals.losses,
    gamesPlayed: totals.gamesPlayed,
    resources: totals.resources,
    beds: { ...totals.beds, ...computed.beds },
    kills: mergeBreakdown(totals.kills, computed.kills),
    finals: mergeBreakdown(totals.finals, computed.finals),
  };
}

const DREAM_SOURCES: Record<
  BedWarsDream,
  (raw: BedWarsStats) => NonEmptyModes
> = {
  armed: (r) => [r.doubles.armed, r.fours.armed],
  lucky: (r) => [r.doubles.lucky, r.fours.lucky],
  swap: (r) => [r.doubles.swap, r.fours.swap],
  underworld: (r) => [r.doubles.underworld, r.fours.underworld],
  voidless: (r) => [r.doubles.voidless, r.fours.voidless],
  totallyNormal: (r) => [r.doubles.totallyNormal],
  rush: (r) => [r.solo.rush, r.doubles.rush, r.fours.rush],
  ultimate: (r) => [r.solo.ultimate, r.doubles.ultimate, r.fours.ultimate],
  oneBlock: (r) => [r.solo.oneBlock],
};

function computeDreams(raw: BedWarsStats): BedWarsDreamsComputed {
  const result = {} as Record<BedWarsDream, BedWarsAggregateComputed>;
  for (const dream of Object.keys(DREAM_SOURCES) as BedWarsDream[]) {
    result[dream] = computeAggregate(aggregateModes(DREAM_SOURCES[dream](raw)));
  }
  return result;
}

export function computeBedWars(raw: BedWarsStats): BedWarsComputed {
  const level = bedwarsStar(raw.experience);
  const overallFinals = raw.overall.finals.total;
  const fkdr = ratio(overallFinals.kills, overallFinals.deaths);
  return {
    level,
    prestige: bedwarsPrestige(level),
    xpToNextLevel: bedwarsXpToNextLevel(raw.experience),
    starsToNextPrestige: bedwarsStarsToNextPrestige(level),
    xpForNextPrestige:
      BEDWARS_PRESTIGE_CYCLE_XP - (raw.experience % BEDWARS_PRESTIGE_CYCLE_XP),
    index: round2(level * fkdr * fkdr),
    finalsPerStar: ratio(overallFinals.kills, level),
    winsPerStar: ratio(raw.overall.wins, level),
    legendaryChestRate: ratio(
      raw.boxes.openedLegendaries,
      raw.boxes.openedChests,
    ),
    practice: {
      bridging: computePracticeMode(raw.practice.bridging),
      fireballJumping: computePracticeMode(raw.practice.fireballJumping),
      mlg: computePracticeMode(raw.practice.mlg),
      pearlClutching: computePracticeMode(raw.practice.pearlClutching),
    },
    overall: computeMode(raw.overall),
    core: computeAggregate(
      aggregateModes([raw.solo, raw.doubles, raw.threes, raw.fours]),
    ),
    perMode: {
      solo: computeMode(raw.solo),
      doubles: computeMode(raw.doubles),
      threes: computeMode(raw.threes),
      fours: computeMode(raw.fours),
      fourVsFour: computeMode(raw.fourVsFour),
      castle: computeMode(raw.castle),
    },
    dreams: computeDreams(raw),
  };
}

