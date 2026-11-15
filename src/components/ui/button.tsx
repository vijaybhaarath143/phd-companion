import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-transparent bg-clip-padding font-display text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-75 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* Chunky buttons: a solid 4px edge (no blur) that disappears as the button drops on press. */
        default:
          "bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-edge)] hover:bg-[color-mix(in_srgb,var(--primary),white_8%)] active:not-aria-[haspopup]:translate-y-1 active:not-aria-[haspopup]:shadow-none",
        outline:
          "border-border bg-card text-foreground shadow-edge hover:bg-zinc-50 active:not-aria-[haspopup]:translate-y-1 active:not-aria-[haspopup]:shadow-none aria-expanded:bg-muted dark:border-input",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-zinc-200 active:not-aria-[haspopup]:translate-y-px aria-expanded:bg-zinc-200",
        sky:
          "bg-sky text-white shadow-[0_4px_0_var(--sky-strong)] hover:bg-[color-mix(in_srgb,var(--sky),white_8%)] active:not-aria-[haspopup]:translate-y-1 active:not-aria-[haspopup]:shadow-none",
        ghost:
          "font-bold hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border-overdue-border bg-card text-destructive shadow-[0_4px_0_var(--overdue-border)] hover:bg-overdue active:not-aria-[haspopup]:translate-y-1 active:not-aria-[haspopup]:shadow-none focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "font-bold text-sky underline-offset-4 hover:text-sky-strong hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-lg border px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-lg px-3 text-[0.8125rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-11",
        "icon-xs":
          "size-7 rounded-lg border in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-lg in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
