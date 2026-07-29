import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "relative flex flex-col justify-between h-full w-full overflow-hidden rounded-[40px] p-10 shadow-sm transition-shadow duration-300 hover:shadow-2xl",
  {
    variants: {
      gradient: {
        blue: "bg-gradient-to-br from-blue-500 to-blue-700 text-white",
        sky: "bg-gradient-to-br from-sky-50 to-sky-100/70 text-slate-900",
        violet: "bg-gradient-to-br from-violet-50 to-indigo-100/70 text-slate-900",
        slate: "bg-gradient-to-br from-slate-50 to-slate-200/70 text-slate-900",
        emerald: "bg-gradient-to-br from-emerald-50 to-teal-100/70 text-slate-900",
        amber: "bg-gradient-to-br from-amber-50 to-orange-100/70 text-slate-900",
      },
    },
    defaultVariants: {
      gradient: "slate",
    },
  }
);

const badgeVariants = cva(
  "mb-8 inline-flex items-center justify-center h-14 w-14 rounded-2xl",
  {
    variants: {
      gradient: {
        blue: "bg-white/15",
        sky: "bg-sky-500/10",
        violet: "bg-violet-500/10",
        slate: "bg-slate-500/10",
        emerald: "bg-emerald-500/10",
        amber: "bg-amber-500/10",
      },
    },
    defaultVariants: {
      gradient: "slate",
    },
  }
);

const iconColorVariants: Record<string, string> = {
  blue: "text-white",
  sky: "text-sky-600",
  violet: "text-violet-600",
  slate: "text-slate-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
};

const descriptionColorVariants: Record<string, string> = {
  blue: "text-blue-100/90",
  sky: "text-slate-600",
  violet: "text-slate-600",
  slate: "text-slate-600",
  emerald: "text-slate-600",
  amber: "text-slate-600",
};

export interface GradientCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  icon: LucideIcon;
  title: string;
  description: string;
  imageUrl?: string;
}

const GradientCard = React.forwardRef<HTMLDivElement, GradientCardProps>(
  ({ className, gradient, icon: Icon, title, description, imageUrl, ...props }, ref) => {
    const key = gradient ?? "slate";
    const cardAnimation = {
      rest: { scale: 1, y: 0 },
      hover: { scale: 1.02, y: -4 },
    };
    // Bouncy overshoot on hover — low damping lets the figure spring past its
    // resting scale/rotation before settling, giving it a playful "bounce" feel.
    const imageAnimation = {
      rest: { scale: 1, rotate: 0, y: 0 },
      hover: { scale: 1.15, rotate: 6, y: -10 },
    };

    return (
      <motion.div
        variants={cardAnimation}
        initial="rest"
        whileHover="hover"
        animate="rest"
        className="h-full"
      >
        <div ref={ref} className={cn(cardVariants({ gradient }), className)} {...props}>
          {imageUrl && (
            <motion.img
              src={imageUrl}
              alt=""
              aria-hidden="true"
              variants={imageAnimation}
              transition={{ type: "spring", stiffness: 300, damping: 10 }}
              className="absolute -right-6 -bottom-6 w-32 h-32 object-contain pointer-events-none select-none drop-shadow-xl"
            />
          )}

          <div className={cn(badgeVariants({ gradient }))}>
            <Icon className={cn("h-7 w-7", iconColorVariants[key])} />
          </div>

          <div className="z-10 flex flex-col h-full">
            <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter">{title}</h3>
            <p className={cn("leading-relaxed font-medium", descriptionColorVariants[key])}>
              {description}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }
);
GradientCard.displayName = "GradientCard";

export { GradientCard, cardVariants };
