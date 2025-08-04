
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  className?: string;
  compact?: boolean; // 新增緊湊模式
}

const StatCard: React.FC<StatCardProps> = ({ title, value, className, compact = false }) => {
  return (
    <Card className={cn(
      'w-full shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02]',
      compact ? 'min-h-[60px]' : 'min-h-[80px]',
      className
    )}>
      <CardContent className={cn(
        'flex flex-col items-start',
        compact ? 'p-2 sm:p-3' : 'p-3 sm:p-4'
      )}>
        <div className={cn(
          'font-medium text-muted-foreground uppercase tracking-wider',
          compact ? 'text-[10px] sm:text-xs mb-0.5' : 'text-xs sm:text-sm mb-1 sm:mb-2'
        )}>
          {title}
        </div>
        <div className={cn(
          'font-bold text-foreground',
          compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl lg:text-3xl'
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
