import { computed } from "vue";
import { dateToMs } from "@/utils/date";
import {
  MS_PER_DAY,
  calcXDomain,
  calcYDomain,
  calcPaceYDomain,
  scaleXFactory,
  scaleYFactory,
  buildPathD,
  buildXTicks,
  buildAveragePacePath,
  buildDeviationWedgePath,
  buildRequiredPaceData,
  buildPointsEarnedData,
  requiredPerDayFromBaseline,
} from "@/utils/chart";
import { buildRankBands } from "@/utils/rankColors";

/**
 * All pure, reactive chart geometry derived for LineGraph: domains, scales,
 * the main line + projection paths, and the pace sub-graph data. Kept out of
 * the component so LineGraph.vue is just orchestration + template.
 *
 * Inputs are the reactive sources the geometry depends on:
 * - dimensions: fixed pixel constants for the main plot + pace area
 * - today: the single Date the x-domain is clamped against
 * - mode: "world-tour" | "ranked" (fixed per mount)
 * - goalOptions: getter for the rank-threshold list (rank overlay bands)
 * - seasonStart/seasonEnd/goalWinPoints: persisted graph settings (refs)
 * - isSeasonValid: ref, true when start < end
 * - points: reactive raw point array; sortedPoints: date-sorted computed
 */
export function useChartGeometry({
  width,
  height,
  padding,
  paceTop,
  paceHeight,
  pacePadY,
  today,
  mode,
  goalOptions,
  seasonStart,
  seasonEnd,
  goalWinPoints,
  isSeasonValid,
  points,
  sortedPoints,
}) {
  const xDomain = computed(() =>
    calcXDomain(seasonStart.value, seasonEnd.value, today)
  );

  // Filter raw points to the current season (x) domain for display/scaling
  const pointsInSeason = computed(() => {
    const [min, max] = xDomain.value;
    return points.filter((p) => {
      const ms = dateToMs(p.date);
      return isFinite(ms) && ms >= min && ms <= max;
    });
  });

  const yDomain = computed(() =>
    calcYDomain(pointsInSeason.value, goalWinPoints.value)
  );

  // Scales
  const scaleX = (dateStr) =>
    scaleXFactory(xDomain.value, width, padding)(dateStr);
  const scaleY = (y) => scaleYFactory(yDomain.value, height, padding)(y);

  // Rank overlay bands
  const rankBands = computed(() => buildRankBands(goalOptions()));

  // Points within season, but sorted by date for path rendering
  const sortedPointsInSeason = computed(() => {
    const [min, max] = xDomain.value;
    return sortedPoints.value.filter((p) => {
      const ms = dateToMs(p.date);
      return ms >= min && ms <= max;
    });
  });

  const scaledPoints = computed(() =>
    sortedPointsInSeason.value.map((p) => ({ x: scaleX(p.date), y: scaleY(p.y) }))
  );

  // Anchor that pace/projection math is measured from. World Tour starts every
  // season at 0, so the anchor is (seasonStart, 0). Ranked starts at a placement
  // rank, so the anchor is the first recorded point — pace, projections and
  // "points earned" then measure progress *since placement*, not from 0.
  const paceBaseline = computed(() => {
    const sp = sortedPointsInSeason.value;
    if (mode === "ranked" && sp.length) {
      return { ms: dateToMs(sp[0].date), dateStr: sp[0].date, y: Number(sp[0].y) || 0 };
    }
    return { ms: xDomain.value[0], dateStr: seasonStart.value, y: 0 };
  });

  // Build path points with a synthetic baseline at season start (y=0) when the
  // first in-season point occurs after the season start. This extends the blue
  // line visually back to day zero without adding a visible point. Ranked is
  // exempt: its line starts at the placement point, with the pre-placement span
  // drawn as a separate flat baseline (see placementBaselinePath).
  const scaledPathPoints = computed(() => {
    const sp = scaledPoints.value;
    if (!sp.length) return sp;
    if (mode === "ranked") return sp;
    const seasonStartMs = dateToMs(seasonStart.value);
    const firstMs = dateToMs(sortedPointsInSeason.value[0].date);
    if (isFinite(seasonStartMs) && isFinite(firstMs) && firstMs > seasonStartMs) {
      const baseline = { x: scaleX(seasonStart.value), y: scaleY(0) };
      return [baseline, ...sp];
    }
    return sp;
  });

  const pathD = computed(() => buildPathD(scaledPathPoints.value));

  // Ranked only: a flat line from season start across to the placement point at
  // the placement RS, making it clear the climb begins at placement (not 0).
  const placementBaselinePath = computed(() => {
    if (mode !== "ranked") return "";
    const sp = sortedPointsInSeason.value;
    if (!sp.length) return "";
    const seasonStartMs = dateToMs(seasonStart.value);
    const firstMs = dateToMs(sp[0].date);
    if (!(isFinite(seasonStartMs) && isFinite(firstMs) && firstMs > seasonStartMs)) return "";
    const x1 = scaleX(seasonStart.value);
    const x2 = scaleX(sp[0].date);
    const y = scaleY(Number(sp[0].y) || 0);
    return `M${x1},${y} L${x2},${y}`;
  });

  // Projection paths
  const pathGoalFromZero = computed(() => {
    if (!isSeasonValid.value) return "";
    const x1 = scaleX(paceBaseline.value.dateStr);
    const y1 = scaleY(paceBaseline.value.y);
    const x2 = scaleX(seasonEnd.value);
    const y2 = scaleY(goalWinPoints.value);
    return `M${x1},${y1} L${x2},${y2}`;
  });

  const pathGoalFromLast = computed(() => {
    if (!isSeasonValid.value || sortedPointsInSeason.value.length === 0)
      return "";
    const last =
      sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1];
    const lastMs = dateToMs(last.date);
    if (lastMs >= xDomain.value[1]) return "";
    const x1 = scaleX(last.date);
    const y1 = scaleY(last.y);
    const x2 = scaleX(seasonEnd.value);
    const y2 = scaleY(goalWinPoints.value);
    return `M${x1},${y1} L${x2},${y2}`;
  });

  const pathAveragePace = computed(() => {
    if (!isSeasonValid.value) return "";
    return buildAveragePacePath(
      sortedPointsInSeason.value,
      xDomain.value[0],
      xDomain.value[1],
      scaleX,
      scaleY,
      paceBaseline.value
    );
  });

  const pathDeviationWedge = computed(() => {
    if (!isSeasonValid.value) return "";
    return buildDeviationWedgePath(
      sortedPointsInSeason.value,
      xDomain.value[0],
      xDomain.value[1],
      scaleX,
      scaleY,
      paceBaseline.value
    );
  });

  const xTicks = computed(() => buildXTicks(xDomain.value, width, padding, 4));

  // Pace graph data
  const paceRequiredData = computed(() => {
    if (!isSeasonValid.value) return [];
    return buildRequiredPaceData(sortedPointsInSeason.value, goalWinPoints.value, xDomain.value[1]);
  });

  const paceEarnedData = computed(() =>
    buildPointsEarnedData(sortedPointsInSeason.value, paceBaseline.value.y)
  );

  const paceYDomain = computed(() =>
    calcPaceYDomain([
      ...paceRequiredData.value.map((p) => p.y),
      ...paceEarnedData.value.map((p) => p.y),
    ])
  );

  const paceScaleY = (y) => {
    const [min, max] = paceYDomain.value;
    return (paceTop + pacePadY) + (1 - (y - min) / (max - min)) * (paceHeight - pacePadY * 2);
  };

  const scaledPaceRequired = computed(() =>
    paceRequiredData.value.map((p) => ({ x: scaleX(p.date), y: paceScaleY(p.y) }))
  );

  const scaledPaceEarned = computed(() =>
    paceEarnedData.value.map((p) => ({ x: scaleX(p.date), y: paceScaleY(p.y) }))
  );

  const paceRequiredPath = computed(() => buildPathD(scaledPaceRequired.value));
  const paceEarnedPath = computed(() => buildPathD(scaledPaceEarned.value));

  // Pace stats
  const requiredPerDayZero = computed(() => {
    // Slope of the baseline→goal projection per day, matching pathGoalFromZero.
    // World Tour anchors at (seasonStart, 0) → goal over the whole season. Ranked
    // anchors at the placement point → (goal - placement) over days since placement.
    const { ms, y } = paceBaseline.value;
    return requiredPerDayFromBaseline(goalWinPoints.value, y, ms, xDomain.value[1]);
  });

  const isFromLastDefined = computed(
    () =>
      sortedPointsInSeason.value.length > 0 &&
      dateToMs(
        sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1].date
      ) < xDomain.value[1]
  );

  const requiredPerDayFromLast = computed(() => {
    if (!isFromLastDefined.value) return 0;
    const last =
      sortedPointsInSeason.value[sortedPointsInSeason.value.length - 1];
    const remaining = goalWinPoints.value - last.y;
    const endMs = xDomain.value[1];
    const left = Math.max(
      1,
      Math.round((endMs - dateToMs(last.date)) / MS_PER_DAY)
    );
    return remaining / left;
  });

  return {
    xDomain,
    pointsInSeason,
    yDomain,
    scaleX,
    scaleY,
    rankBands,
    sortedPointsInSeason,
    scaledPoints,
    paceBaseline,
    scaledPathPoints,
    pathD,
    placementBaselinePath,
    pathGoalFromZero,
    pathGoalFromLast,
    pathAveragePace,
    pathDeviationWedge,
    xTicks,
    paceRequiredData,
    paceEarnedData,
    paceYDomain,
    paceScaleY,
    scaledPaceRequired,
    scaledPaceEarned,
    paceRequiredPath,
    paceEarnedPath,
    requiredPerDayZero,
    isFromLastDefined,
    requiredPerDayFromLast,
  };
}
