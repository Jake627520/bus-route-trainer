import React from 'react';

export interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  label = 'Session Progress',
  className = '',
}) => {
  const percentage = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        <span>{label}</span>
        <span>
          {current} / {total} ({percentage}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden"
      >
        <div
          className="bg-sky-600 dark:bg-sky-500 h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
