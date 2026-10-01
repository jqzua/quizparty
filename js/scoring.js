export function scoreAnswer({ correct, elapsedMs, durationMs, mode, streak }) {
  if (!correct) return { points: 0, streak: 0 };
  const nextStreak = streak + 1;
  const multiplier = mode === 'double' ? 2 : mode === 'none' ? 0 : 1;
  const speed = 1 - Math.max(0, Math.min(elapsedMs, durationMs)) / durationMs / 2;
  return {
    points: Math.round(1000 * speed) * multiplier + Math.min(nextStreak - 1, 5) * 100 * (multiplier ? 1 : 0),
    streak: nextStreak,
  };
}
