import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: string;
  changePositive?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  change,
  changePositive,
  className,
}: StatCardProps) {
  return (
    <div className={cn("bg-card border border-default rounded-xl p-6", className)}>
      <div className="text-sm text-muted mb-1">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
      {change && (
        <div
          className={cn(
            "text-sm mt-2 font-medium",
            changePositive ? "text-green" : "text-red"
          )}
        >
          {change}
        </div>
      )}
    </div>
  );
}
