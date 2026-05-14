import { motion, HTMLMotionProps } from "framer-motion";
import React from "react";

type PageTransitionProps = HTMLMotionProps<"div">;

export const PageTransition = React.forwardRef<HTMLDivElement, PageTransitionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

PageTransition.displayName = "PageTransition";
