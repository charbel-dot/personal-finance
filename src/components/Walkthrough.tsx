import { ArrowLeft, ArrowRight, Plus, Sparkles } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useQuickAdd } from '@/context/quickAdd';
import { useIsDesktop } from '@/hooks/use-media-query';
import { useAppData, usePatchSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * First-run walkthrough: a short spotlight tour over the real interface. Elements opt in with
 * `data-tour="<target>"`; when the same target exists twice (phone and desktop chrome) the visible
 * one wins. Runs once per account (`settings.tourDone`) and can be replayed from Settings via `/?tour`.
 */

type Target = 'balance' | 'add' | 'nav' | 'settings';

interface Step {
  target?: Target;
  title: string;
  body: (desktop: boolean) => string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Money',
    body: () =>
      'Track what comes in, what goes out, and what you keep. This quick tour shows you around in under a minute.',
  },
  {
    target: 'balance',
    title: 'Your Money at a Glance',
    body: () =>
      'Your current balance, with this month’s income and spending underneath. Tap any figure to see the transactions behind it.',
  },
  {
    target: 'add',
    title: 'Add in Seconds',
    body: (desktop) =>
      `Log an expense or income: type the amount, pick a category, done.${desktop ? ' Press N from anywhere to open it.' : ''}`,
  },
  {
    target: 'nav',
    title: 'Look Back, Plan Ahead',
    body: () =>
      'History keeps every transaction. Recurring adds your regular bills automatically. Savings tracks your goals.',
  },
  {
    target: 'settings',
    title: 'Make It Yours',
    body: (desktop) =>
      `${desktop ? 'In Settings, set' : 'Open Settings from this account menu to set'} your currencies, rate and opening balance, and choose how each income splits into needs, wants and savings.`,
  },
  {
    title: 'You’re All Set',
    body: () => 'Start by adding your first transaction. You can replay this tour from Settings at any time.',
  },
];

const GAP = 12;
const GUTTER = 16;
const PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTarget(target: Target): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Where the card goes: beside the spotlight where it fits, otherwise docked to the screen edge. */
function placeCard(spot: Rect | null, card: { width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(GUTTER, x), vw - card.width - GUTTER);
  const clampY = (y: number) => Math.min(Math.max(GUTTER, y), vh - card.height - GUTTER);
  if (!spot) return { top: (vh - card.height) / 2, left: (vw - card.width) / 2 };

  const below = spot.top + spot.height + GAP;
  const above = spot.top - GAP - card.height;
  const right = spot.left + spot.width + GAP;
  const centeredX = clampX(spot.left + spot.width / 2 - card.width / 2);
  const centeredY = clampY(spot.top + spot.height / 2 - card.height / 2);

  if (below + card.height <= vh - GUTTER) return { top: below, left: centeredX };
  if (above >= GUTTER) return { top: above, left: centeredX };
  if (right + card.width <= vw - GUTTER) return { top: centeredY, left: right };
  // Nothing fits (a tall target on a short screen): dock at the edge furthest from it.
  const spotCenter = spot.top + spot.height / 2;
  return { top: spotCenter > vh / 2 ? GUTTER : vh - card.height - GUTTER, left: centeredX };
}

export function Walkthrough() {
  const { settings } = useAppData();
  const patch = usePatchSettings();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const desktop = useIsDesktop();
  const { openNew } = useQuickAdd();

  const replay = params.has('tour');
  const [dismissed, setDismissed] = useState(false);
  const open = location.pathname === '/' && (replay || (!settings.tourDone && !dismissed));

  const finish = useCallback(
    (then?: () => void) => {
      setDismissed(true);
      if (replay) {
        setParams(
          (p) => {
            p.delete('tour');
            return p;
          },
          { replace: true },
        );
      }
      if (!settings.tourDone) patch.mutate({ tourDone: true });
      then?.();
    },
    [replay, setParams, settings.tourDone, patch],
  );

  if (!open) return null;
  return (
    <TourOverlay
      // A replay always starts from the first step.
      key={replay ? 'replay' : 'first-run'}
      desktop={desktop}
      onSkip={() => finish()}
      onFinish={(addFirst) => finish(addFirst ? () => openNew('expense') : undefined)}
    />
  );
}

function TourOverlay({
  desktop,
  onSkip,
  onFinish,
}: {
  desktop: boolean;
  onSkip: () => void;
  onFinish: (addFirst: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  // Callback ref: Radix mounts the portal content a beat after this component, so a plain ref
  // would still be empty when the layout effect below first runs.
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [measured, setSpot] = useState<{ target: Target; rect: Rect | null } | null>(null);
  const spot = current.target && measured?.target === current.target ? measured.rect : null;
  // `moved`: the card has been placed before, so changes animate (the first placement does not).
  const [pos, setPos] = useState<{ top: number; left: number; moved: boolean } | null>(null);

  // Find the step's target (it may still be rendering), scroll it into view, then track it.
  useEffect(() => {
    const target = current.target;
    if (!target) return;
    let el: HTMLElement | null = null;
    let tries = 0;
    let timer = 0;
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpot({
        target,
        rect: { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 },
      });
    };
    const locate = () => {
      el = findTarget(target);
      if (!el) {
        // Not on screen yet: retry briefly, then skip the spotlight rather than block the tour.
        if (tries++ < 20) timer = window.setTimeout(locate, 100);
        else setSpot({ target, rect: null });
        return;
      }
      const r = el.getBoundingClientRect();
      const fits = r.top >= GUTTER && r.bottom <= window.innerHeight - GUTTER;
      if (!fits) el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      measure();
    };
    locate();
    const onChange = () => requestAnimationFrame(measure);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, { capture: true });
    };
  }, [current.target]);

  // Position the card once its size is known (it changes per step and per screen width).
  useLayoutEffect(() => {
    const el = card;
    if (!el) return;
    const update = () => {
      const next = placeCard(spot, { width: el.offsetWidth, height: el.offsetHeight });
      setPos((prev) => ({ ...next, moved: prev !== null }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [card, spot, step]);

  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [step]);

  const next = () => (last ? onFinish(false) : setStep(step + 1));
  const back = () => setStep(Math.max(0, step - 1));

  const spotlight: CSSProperties = spot
    ? { top: spot.top, left: spot.left, width: spot.width, height: spot.height }
    : { top: '50%', left: '50%', width: 0, height: 0 };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onSkip()}>
      <DialogPrimitive.Portal>
        {/* Dims everything except the highlighted element. */}
        <div
          aria-hidden="true"
          className="pointer-events-auto fixed inset-0 z-[60] animate-in duration-300 fade-in-0"
          onPointerDown={(e) => e.preventDefault()}
        >
          <div
            className={cn(
              'absolute rounded-2xl shadow-[0_0_0_200vmax_oklch(0_0_0/0.6)] transition-[top,left,width,height] duration-500 ease-out-expo',
              spot && 'ring-2 ring-white/70',
            )}
            style={spotlight}
          />
        </div>
        <DialogPrimitive.Content
          ref={setCard}
          aria-describedby="tour-body"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') next();
            else if (e.key === 'ArrowLeft') back();
          }}
          style={
            pos
              ? { transform: `translate3d(${Math.round(pos.left)}px, ${Math.round(pos.top)}px, 0)` }
              : { visibility: 'hidden' }
          }
          className={cn(
            'fixed top-0 left-0 z-[61] w-[min(22rem,calc(100vw-2rem))] rounded-3xl border bg-popover p-5 text-popover-foreground shadow-[0_24px_48px_-12px_oklch(0_0_0/0.45)] outline-none',
            pos?.moved && 'transition-transform duration-500 ease-out-expo',
          )}
        >
          <div key={step} className="animate-in duration-300 fade-in-0 slide-in-from-bottom-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground tabular-nums" aria-live="polite">
                {step === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-brand-fg">
                    <Sparkles className="size-3.5" aria-hidden="true" /> Quick Tour
                  </span>
                ) : (
                  `${step} of ${STEPS.length - 1}`
                )}
              </p>
              {!last && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="-my-2 -mr-2 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Skip
                </button>
              )}
            </div>
            <DialogPrimitive.Title className="mt-2 text-lg font-semibold tracking-tight text-balance">
              {current.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="tour-body" className="mt-1.5 text-sm text-pretty text-muted-foreground">
              {current.body(desktop)}
            </DialogPrimitive.Description>

            <Progress step={step} />

            <div className="mt-4 flex items-center gap-2">
              {step > 0 && !last && (
                <Button variant="ghost" className="h-11 px-3" onClick={back} aria-label="Previous step">
                  <ArrowLeft aria-hidden="true" />
                </Button>
              )}
              {last ? (
                <>
                  <Button variant="ghost" className="h-11" onClick={() => onFinish(false)}>
                    Done
                  </Button>
                  <Button ref={primary} className="press h-11 flex-1" onClick={() => onFinish(true)}>
                    <Plus aria-hidden="true" /> Add First Transaction
                  </Button>
                </>
              ) : (
                <Button ref={primary} className="press ml-auto h-11 min-w-28" onClick={next}>
                  {step === 0 ? 'Show Me Around' : 'Next'}
                  <ArrowRight aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mt-4 flex gap-1" aria-hidden="true">
      {STEPS.map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors duration-300',
            i <= step ? 'bg-foreground' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}
