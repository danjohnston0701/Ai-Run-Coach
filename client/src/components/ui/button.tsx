import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Brand buttons — Android: primary cyan with dark text, outlined secondary, warm orange accent.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-root disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-root hover:bg-[#33ddff] shadow-[0_0_0_1px_rgba(0,212,255,0.4),0_8px_24px_-8px_rgba(0,212,255,0.55)]",
        accent: "bg-orange text-white hover:bg-[#ff7d4d] shadow-[0_8px_24px_-8px_rgba(255,107,53,0.6)]",
        destructive: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
        outline: "border border-line-strong/80 bg-transparent text-ink hover:bg-surface-2 hover:border-line-strong",
        secondary: "bg-surface-2 text-ink border border-line hover:bg-surface-3/70",
        ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
        link: "text-brand underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
