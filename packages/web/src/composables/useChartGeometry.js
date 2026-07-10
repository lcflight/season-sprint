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
  mapOverlayByDayOfSeason,
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
 * - overlayStart/overlayEnd: optional refs for a previous season to overlay,
 *   aligned by day-of-season onto the viewed (seasonStart/seasonEnd) window.
 *   Null/undefined when no overlay is active.
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
  overlayStart,
  overlayEnd,
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

  // Previous-season points filtered to the overlay window (raw, date-sorted).
  // These get re-mapped by day-of-season for display, but their y-values also
  // feed the y-domain so a higher past season isn't clipped off the top.
  const overlayPointsRaw = computed(() => {
    const start = overlayStart?.value;
    const end = overlayEnd?.value;
    if (!start || !end) return [];
    const min = dateToMs(start);
    const max = dateToMs(end);
    return points
      .filter((p) => {
        const ms = dateToMs(p.date);
        return isFinite(ms) && ms >= min && ms <= max;
      })
      .sort((a, b) => dateToMs(a.date) - dateToMs(b.date));
  });

  const yDomain = computed(() =>
    calcYDomain(
      [...pointsInSeason.value, ...overlayPointsRaw.value],
      goalWinPoints.value
    )
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

  // Overlay: a previous season's line, re-mapped so its day 0 sits at the
  // viewed season's start, then scaled with the same axes. World Tour gets the
  // same synthetic day-0 baseline (y=0) the main line uses; ranked starts at
  // its first recorded point.
  const overlayMapped = computed(() =>
    mapOverlayByDayOfSeason(
      overlayPointsRaw.value,
      dateToMs(overlayStart?.value),
      dateToMs(seasonStart.value),
      dateToMs(seasonEnd.value)
    )
  );

  const overlayScaledPoints = computed(() =>
    overlayMapped.value.map((p) => ({ x: scaleX(p.date), y: scaleY(p.y) }))
  );

  const overlayPathPoints = computed(() => {
    const sp = overlayScaledPoints.value;
    if (!sp.length) return sp;
    const overlayStartMs = dateToMs(overlayStart?.value);
    const firstMs = dateToMs(overlayPointsRaw.value[0]?.date);
    if (!isFinite(overlayStartMs) || !isFinite(firstMs) || firstMs <= overlayStartMs) {
      return sp;
    }
    // Ranked doesn't start at 0 -- stitch a flat lead-in at the overlay
    // season's own first recorded value (its placement), matching the live
    // line's placementBaselinePath semantics. Without this, a ranked overlay
    // season with only one logged point (common in Ranked, which tends to
    // get logged less often than World Tour) never draws a line at all --
    // buildPathD needs >=2 points, so the "compare to a previous season"
    // line silently failed to render for Ranked.
    const baselineY = mode === "ranked" ? overlayPointsRaw.value[0].y : 0;
    return [{ x: scaleX(seasonStart.value), y: scaleY(baselineY) }, ...sp];
  });

  const overlayPathD = computed(() => buildPathD(overlayPathPoints.value));

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

  // Bar variant of the "points earned per day" series: a rect per day, grown
  // from the zero line up (gain) or down (loss). Matches the mobile apps. Width
  // tracks one day of the season axis (with a fill gap) so bars stay proportional
  // — thinner on long seasons, wider on short ones — clamped to stay visible
  // without overlapping.
  const PACE_BAR_MIN_WIDTH = 2;
  const PACE_BAR_MAX_WIDTH = 14;
  const PACE_BAR_FILL = 0.7;
  const paceBarWidth = computed(() => {
    const [minMs, maxMs] = xDomain.value;
    const seasonDays = Math.max(1, (maxMs - minMs) / MS_PER_DAY);
    const dayWidth = (width - padding * 2) / seasonDays;
    return Math.max(
      PACE_BAR_MIN_WIDTH,
      Math.min(PACE_BAR_MAX_WIDTH, dayWidth * PACE_BAR_FILL)
    );
  });
  const scaledPaceEarnedBars = computed(() => {
    const zeroY = paceScaleY(0);
    const w = paceBarWidth.value;
    return scaledPaceEarned.value.map((p) => ({
      x: p.x - w / 2,
      y: Math.min(p.y, zeroY),
      width: w,
      height: Math.abs(p.y - zeroY),
    }));
  });

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
    overlayScaledPoints,
    overlayPathD,
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
    scaledPaceEarnedBars,
    paceRequiredPath,
    paceEarnedPath,
    requiredPerDayZero,
    isFromLastDefined,
    requiredPerDayFromLast,
  };
}
