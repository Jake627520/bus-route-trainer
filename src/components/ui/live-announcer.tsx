import React from 'react';

/**
 * Change 48: 常駐的螢幕閱讀器播報區。
 * live region 必須「先存在、之後內容才改變」才會被播報，所以這個元件要一直掛著，
 * 只改 message；不要用條件渲染整個區塊。
 */
export const LiveAnnouncer: React.FC<{ message: string }> = ({ message }) => (
  <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
    {message}
  </div>
);
