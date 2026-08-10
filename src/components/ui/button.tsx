import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 font-sans tracking-wide active:bg-[#E8EAED]",
  {
    variants: {
      variant: {
        default:
          "bg-[#1A73E8] text-white hover:bg-[#1765CC] active:bg-[#1557B0] shadow-xs font-medium",
        secondary:
          "bg-[#F8F9FA] text-[#202124] border border-[#DADCE0] hover:bg-[#F1F3F4] hover:border-[#BDC1C6] font-medium",
        ghost: "text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124] font-medium",
        outline:
          "border border-[#DADCE0] bg-white text-[#202124] hover:bg-[#F8F9FA] hover:border-[#BDC1C6] font-medium",
        danger: "bg-[#D93025] text-white hover:bg-[#C5221F] shadow-xs font-medium",
      },
      size: {
        default: "h-9 rounded-md px-4 text-xs sm:text-sm",
        sm: "h-7 rounded-md px-2.5 text-xs font-medium",
        lg: "h-11 rounded-md px-6 text-sm font-medium",
        icon: "size-9 rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";
