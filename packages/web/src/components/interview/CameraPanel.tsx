import React from 'react';
import { CameraOff, ScanFace, ShieldCheck, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import type { CameraPresence } from '@/components/interview/useCameraPresence';

/**
 * Compact camera rail for the live interview. Keeps the permission prompt and
 * privacy stance visible without turning the round into a video call.
 */
export const CameraPanel = ({ camera }: { camera: CameraPresence }) => {
  const { status, error, videoRef, faceNow, sampleCount, enable, disable, supported } = camera;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative h-[86px] w-[124px] shrink-0 overflow-hidden rounded-lg border border-border bg-[#0c0c0f]">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Camera preview"
            className={cn('h-full w-full -scale-x-100 object-cover transition-opacity', status === 'live' ? 'opacity-100' : 'opacity-0')}
          />
          {status !== 'live' && (
            <div className="absolute inset-0 grid place-items-center">
              {supported ? <Video className="h-5 w-5 text-white/30" /> : <CameraOff className="h-5 w-5 text-white/30" />}
            </div>
          )}
          {status === 'live' && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-white/85">
              <span className={cn('h-1.5 w-1.5 rounded-full', faceNow ? 'bg-success' : 'bg-warning')} />
              {faceNow ? 'Face in frame' : 'Adjust frame'}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-1.5"><ScanFace className="h-3.5 w-3.5" /> Camera presence</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/85">
            Optional. {status === 'live'
              ? `Sampling every couple of seconds (${sampleCount} samples).`
              : 'Turn it on to get feedback on dress, expression, posture and eye contact.'}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            Frames are analysed for feedback and never stored. The interview score is unaffected if you keep it off.
          </p>
          {error && <p className="mt-1 text-[11.5px] text-destructive">{error}</p>}
          {!supported && (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              This browser does not expose a camera API. Typed and voice answers still work.
            </p>
          )}
        </div>

        <div className="shrink-0 sm:self-center">
          {status === 'live' ? (
            <Button variant="outline" size="sm" onClick={disable}>
              <CameraOff className="h-3.5 w-3.5" /> Turn off
            </Button>
          ) : (
            <Button size="sm" onClick={enable} loading={status === 'requesting'} disabled={!supported}>
              <Video className="h-3.5 w-3.5" /> {status === 'denied' ? 'Try again' : 'Enable camera'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraPanel;
