/**
 * Backwards-compatible name for the interviewer portrait. The roster-aware
 * implementation lives in AvatarPortrait; existing imports keep working.
 */
export { AvatarPortrait as InterviewerAvatar, AvatarPortrait as default } from './AvatarPortrait';
export type { InterviewerState } from './AvatarPortrait';
