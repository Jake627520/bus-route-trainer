import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-[0_1px_2px_rgba(38,77,136,0.05),0_8px_24px_-16px_rgba(38,77,136,0.18)] p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
