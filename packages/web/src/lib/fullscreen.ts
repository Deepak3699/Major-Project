/**
 * Enters fullscreen from a click handler so browser user-gesture requirements
 * are satisfied before a route change. If some element is already fullscreen,
 * switch to the document element so the state survives unmounting that room.
 * Callers should await this before navigating to avoid a blank transition.
 */
export function enterFullscreenForNavigation(): Promise<void> {
  try {
    if (document.fullscreenElement === document.documentElement) return Promise.resolve();
    const request = document.documentElement?.requestFullscreen?.();
    return request && typeof request.catch === 'function' ? request.catch(() => undefined) : Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

/** Leaves fullscreen when leaving a room, without disturbing other sessions. */
export function exitFullscreenOnLeave(target?: Element | null): void {
  try {
    if (document.fullscreenElement && (!target || document.fullscreenElement === target)) {
      void document.exitFullscreen().catch(() => undefined);
    }
  } catch {
    // Fullscreen is optional.
  }
}
