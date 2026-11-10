import { Button as GlassButton } from 'glisse';
import { Slot } from 'radix-ui';
import * as React from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { buttonVariants, glassButtonSizes } from './button-variants';

type Props = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

/**
 * App button. Solid, outline, secondary and destructive buttons are liquid glass (glisse); ghost
 * and link stay flat so dense rows and inline actions don't turn into a wall of glass.
 */
function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }: Props) {
  const flat = variant === 'ghost' || variant === 'link';
  if (flat) {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }

  const filled = variant === 'default' || variant === 'destructive';
  const classes = cn(glassButtonSizes({ size }), className);
  if (asChild) {
    // Links styled as glass buttons (no refraction hook, same look).
    return (
      <Slot.Root
        data-slot="button"
        data-variant={filled ? 'filled' : undefined}
        data-destructive={variant === 'destructive' ? '' : undefined}
        className={cn('lg-glass lg-button', classes)}
        {...props}
      />
    );
  }
  const { ref, ...rest } = props;
  return (
    <GlassButton
      ref={ref}
      data-slot="button"
      variant={filled ? 'filled' : 'glass'}
      destructive={variant === 'destructive'}
      className={classes}
      {...rest}
    />
  );
}

export { Button };
