import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

// shadcn-style primitive (cva + tailwind-merge) tuned to Campsite: black ink on white, pill radii, 44px targets.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 select-none whitespace-nowrap font-medium transition-[transform,background-color,opacity] duration-[120ms] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        solid: 'bg-ink text-paper hover:bg-black',
        outline: 'bg-paper text-ink border border-ink/90 hover:bg-mist',
        ghost: 'bg-transparent text-ink hover:bg-mist',
        inverse: 'bg-paper text-ink hover:bg-snow',
        glass: 'bg-paper/85 text-ink backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.08)]',
        dark: 'bg-white/12 text-white hover:bg-white/20',
      },
      size: { md: 'h-11 px-5 text-[15px] rounded-pill', lg: 'h-12 px-6 text-[16px] rounded-pill', sm: 'h-9 px-4 text-[14px] rounded-pill', icon: 'h-11 w-11 rounded-pill', iconSm: 'h-9 w-9 rounded-pill' },
    },
    defaultVariants: { variant: 'solid', size: 'md' },
  },
);
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
export { buttonVariants };
