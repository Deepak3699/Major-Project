import React, { useState } from 'react';
import { MessageSquareHeart, Star } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { candidate } from '@/lib/api';
import { cn } from '@/components/ui/cn';

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setRating(0); setHover(0); setFeedback(''); setDone(false); setError(null); };
  const close = () => { onClose(); window.setTimeout(reset, 200); };

  const submit = async () => {
    if (!rating || !feedback.trim()) { setError('Please add a rating and a short message.'); return; }
    setLoading(true); setError(null);
    try {
      await candidate.feedback({ rating, feedback: feedback.trim() });
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'Could not send feedback.');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={close} title="Share your feedback" description="Help us make AI JobPilot more premium and useful." size="md">
      {done ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"><Star className="h-5 w-5" /></div>
          <p className="mt-4 text-[15px] font-semibold text-foreground">Thank you for your feedback</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Your message helps us improve the experience.</p>
          <Button className="mt-5" onClick={close}>Close</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-2">Rating</p>
            <div className="flex items-center gap-1.5">
              {[1,2,3,4,5].map((n) => (
                <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)} aria-label={`${n} star${n>1?'s':''}`} className="rounded-md p-1 transition-colors hover:bg-accent">
                  <Star className={cn('h-5 w-5', (hover || rating) >= n ? 'fill-signal text-signal' : 'text-muted-foreground/40')} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="feedback-message">Your message</label>
            <Textarea id="feedback-message" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tell us what feels great, what feels confusing, or what you want next..." rows={5} />
          </div>
          {error && <p className="text-[12.5px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={submit} loading={loading}><MessageSquareHeart className="h-4 w-4" />Send feedback</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
