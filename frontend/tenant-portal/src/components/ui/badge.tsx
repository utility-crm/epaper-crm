import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/35 bg-primary/10 text-primary',
        success: 'border-green-500/30 bg-green-500/12 text-green-400',
        warning: 'border-amber-500/30 bg-amber-500/12 text-amber-400',
        destructive: 'border-red-500/30 bg-red-500/12 text-red-400',
        muted: 'border-slate-500/30 bg-slate-500/12 text-slate-400',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
