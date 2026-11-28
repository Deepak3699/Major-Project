import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/components/ui/cn';

const MOTES = Array.from({ length: 14 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  top: `${(index * 23 + 9) % 88}%`,
  size: index % 4 === 0 ? 3 : 2,
  delay: (index % 6) * 0.7,
  duration: 7 + (index % 5) * 1.7,
}));

/**
 * Shared animated atmosphere for the practice rooms. Mirrors the conference
 * hall mood: warm aurora, a receding floor grid, drifting dust and a light
 * sweep. Purely decorative, so it is hidden from assistive technology.
 */
export function RoomAtmosphere({ dense = false, className }: { dense?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute left-1/2 top-[-24%] h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(224,138,84,0.2),transparent_66%)] blur-2xl" />
      <motion.div
        className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-[#c96f4a]/15 blur-3xl"
        animate={{ x: [0, 44, 0], y: [0, 26, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#8a5a7a]/[0.12] blur-3xl"
        animate={{ x: [0, -36, 0], y: [0, -22, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-18%] left-1/3 h-72 w-72 rounded-full bg-[#c99a5e]/10 blur-3xl"
        animate={{ x: [0, 28, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 opacity-[0.16]"
        style={{
          backgroundImage: 'linear-gradient(rgba(233,185,143,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(233,185,143,0.28) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'linear-gradient(to top, black, transparent 82%)',
          WebkitMaskImage: 'linear-gradient(to top, black, transparent 82%)',
        }}
      />
      {dense && MOTES.map((mote, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full bg-[#f2c39a]"
          style={{ left: mote.left, top: mote.top, width: mote.size, height: mote.size }}
          animate={{ y: [0, -18, 0], opacity: [0.05, 0.4, 0.05] }}
          transition={{ duration: mote.duration, repeat: Infinity, delay: mote.delay, ease: 'easeInOut' }}
        />
      ))}
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,240,225,0.05),transparent)]"
        animate={{ x: ['-60%', '360%'] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
