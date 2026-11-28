import React from 'react';
import { cn } from '@/components/ui/cn';

type HairStyle = 'short' | 'curly' | 'bun' | 'long' | 'wave' | 'fade';

interface AvatarPreset {
  id: string;
  label: string;
  background: string;
  skin: string;
  hair: string;
  shirt: string;
  style: HairStyle;
  glasses?: boolean;
  beard?: boolean;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'ember', label: 'Ember', background: '#f3d8c5', skin: '#c98a62', hair: '#3b241c', shirt: '#b95637', style: 'short' },
  { id: 'sage', label: 'Sage', background: '#dfe6d5', skin: '#a96f4f', hair: '#211a16', shirt: '#6f7a52', style: 'curly', glasses: true },
  { id: 'sun', label: 'Sun', background: '#f7e4bb', skin: '#8b573d', hair: '#171310', shirt: '#cf993d', style: 'fade' },
  { id: 'ocean', label: 'Ocean', background: '#d8e4e8', skin: '#e0b08b', hair: '#5a3a25', shirt: '#507a86', style: 'wave' },
  { id: 'plum', label: 'Plum', background: '#e8dce6', skin: '#b97b58', hair: '#2b1b22', shirt: '#7c5a78', style: 'long' },
  { id: 'rose', label: 'Rose', background: '#f3dad9', skin: '#d7a17c', hair: '#4a2b22', shirt: '#c06a66', style: 'bun' },
  { id: 'sand', label: 'Sand', background: '#ede3d0', skin: '#b07d57', hair: '#2a2019', shirt: '#8a7453', style: 'short', beard: true },
  { id: 'mint', label: 'Mint', background: '#dae8e0', skin: '#6f4736', hair: '#1d1714', shirt: '#4f7f6b', style: 'curly', glasses: true },
];

export const DEFAULT_AVATAR_ID = AVATAR_PRESETS[0].id;

export function getAvatarPreset(avatarId?: string | null): AvatarPreset {
  return AVATAR_PRESETS.find((preset) => preset.id === avatarId) || AVATAR_PRESETS[0];
}

function Hair({ preset }: { preset: AvatarPreset }) {
  const { hair, style } = preset;
  if (style === 'curly') {
    return (
      <g fill={hair}>
        <path d="M34 55C31 31 44 17 60 17C77 17 89 31 86 55C81 41 73 35 60 35C47 35 39 41 34 55Z" />
        <circle cx="39" cy="36" r="9" /><circle cx="50" cy="27" r="10" />
        <circle cx="64" cy="25" r="11" /><circle cx="77" cy="32" r="9" />
        <circle cx="84" cy="44" r="8" /><circle cx="35" cy="47" r="7" />
      </g>
    );
  }
  if (style === 'bun') {
    return (
      <g fill={hair}>
        <circle cx="60" cy="15" r="11" />
        <path d="M33 55C31 30 44 18 60 18C77 18 89 30 87 55C82 40 74 34 60 34C46 34 38 40 33 55Z" />
        <path d="M34 48C31 58 31 67 34 73L41 73C38 64 38 55 41 47Z" />
        <path d="M86 48C89 58 89 67 86 73L79 73C82 64 82 55 79 47Z" />
      </g>
    );
  }
  if (style === 'long') {
    return (
      <g fill={hair}>
        <path d="M32 55C30 29 44 17 60 17C77 17 90 29 88 55C83 40 74 34 60 34C46 34 37 40 32 55Z" />
        <path d="M33 46C28 62 28 79 33 90L43 90C38 77 38 61 42 48Z" />
        <path d="M87 46C92 62 92 79 87 90L77 90C82 77 82 61 78 48Z" />
      </g>
    );
  }
  if (style === 'wave') {
    return (
      <g fill={hair}>
        <path d="M33 55C31 30 44 18 60 18C77 18 89 30 87 55C83 43 77 37 71 40C66 43 62 38 57 36C50 33 44 39 39 46C37 49 35 52 33 55Z" />
        <path d="M34 47C39 41 44 38 50 40C45 46 41 51 38 58Z" opacity=".72" />
      </g>
    );
  }
  if (style === 'fade') {
    return (
      <g fill={hair}>
        <path d="M35 48C35 29 46 19 60 19C74 19 85 29 85 48C80 36 72 30 60 30C48 30 40 36 35 48Z" />
        <path d="M35 44C34 48 34 52 35 55L40 55C39 51 39 47 40 44Z" />
        <path d="M85 44C86 48 86 52 85 55L80 55C81 51 81 47 80 44Z" />
      </g>
    );
  }
  return (
    <g fill={hair}>
      <path d="M33 55C31 30 44 18 60 18C77 18 89 30 87 55C82 40 74 34 60 34C46 34 38 40 33 55Z" />
      <path d="M33 50C32 55 32 60 33 64L38 64C37 59 37 54 38 49Z" />
      <path d="M87 50C88 55 88 60 87 64L82 64C83 59 83 54 82 49Z" />
    </g>
  );
}

function Face({ preset }: { preset: AvatarPreset }) {
  const { skin, hair, style, glasses, beard } = preset;
  return (
    <g>
      <rect x="52" y="73" width="16" height="19" rx="7" fill={skin} />
      <path d="M18 120C20 97 37 87 60 87C83 87 100 97 102 120Z" fill={preset.shirt} />
      <path d="M48 90L60 104L72 90C68 87 63 86 60 86C57 86 52 87 48 90Z" fill="#ffffff" opacity=".22" />
      <circle cx="34" cy="57" r="6.5" fill={skin} />
      <circle cx="86" cy="57" r="6.5" fill={skin} />
      <ellipse cx="60" cy="55" rx="25" ry="28" fill={skin} />
      <Hair preset={preset} />
      <circle cx="43" cy="65" r="5" fill="#d9715f" opacity=".16" />
      <circle cx="77" cy="65" r="5" fill="#d9715f" opacity=".16" />
      <path d="M43 48Q49 44.5 55 48" stroke={hair} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M65 48Q71 44.5 77 48" stroke={hair} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <ellipse cx="49" cy="56" rx="2.5" ry="3" fill="#241813" />
      <ellipse cx="71" cy="56" rx="2.5" ry="3" fill="#241813" />
      <circle cx="49.9" cy="54.9" r=".9" fill="#fff" opacity=".85" />
      <circle cx="71.9" cy="54.9" r=".9" fill="#fff" opacity=".85" />
      <path d="M60 55C59 60 58.5 62 60.5 63" stroke="#000000" strokeOpacity=".22" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {beard && (
        <path d="M37 57C39 77 48 87 60 87C72 87 81 77 83 57C79 73 71 80 60 80C49 80 41 73 37 57Z" fill={hair} opacity=".92" />
      )}
      <path d="M52 68Q60 75 68 68" stroke="#5a2f25" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {glasses && (
        <g stroke="#2f2420" strokeWidth="2" fill="#ffffff" fillOpacity=".12">
          <rect x="39.5" y="49.5" width="17" height="13" rx="5" />
          <rect x="63.5" y="49.5" width="17" height="13" rx="5" />
          <path d="M56.5 55H63.5" fill="none" />
          <path d="M39.5 54L34 52.5M80.5 54L86 52.5" fill="none" />
        </g>
      )}
    </g>
  );
}

export interface ProfileAvatarProps {
  avatarId?: string | null;
  src?: string | null;
  name?: string | null;
  className?: string;
  size?: number;
}

/**
 * Candidate identity mark. Uses an uploaded photo when present, otherwise one
 * of the built-in illustrated faces. Always circular and token-ringed so it
 * sits naturally in headers, cards and the profile picker.
 */
export function ProfileAvatar({ avatarId, src, name, className, size }: ProfileAvatarProps) {
  const preset = getAvatarPreset(avatarId);
  const style = size ? { width: size, height: size } : undefined;
  if (src) {
    return (
      <span
        className={cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border', className)}
        style={style}
        role="img"
        aria-label={name ? `${name} profile photo` : 'Profile photo'}
      >
        <img src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border', className)}
      style={style}
      role="img"
      aria-label={name ? `${name} avatar` : `${preset.label} avatar`}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true" focusable="false">
        <rect width="120" height="120" fill={preset.background} />
        <circle cx="100" cy="18" r="30" fill="#ffffff" opacity=".16" />
        <circle cx="16" cy="106" r="24" fill="#ffffff" opacity=".1" />
        <Face preset={preset} />
      </svg>
    </span>
  );
}
