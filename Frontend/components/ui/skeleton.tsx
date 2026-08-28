import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-accent/60 border border-border/40", className)}
      {...props}
    />
  );
}

export { Skeleton };
