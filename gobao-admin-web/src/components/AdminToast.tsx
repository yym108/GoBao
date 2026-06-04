import { useEffect } from 'react';
import type { AdminToastState } from '../lib/errors';

interface AdminToastProps {
  toast: AdminToastState | null;
  onClose: () => void;
}

/**
 * 后台顶部浮层提示。
 * 所有重要操作反馈统一从屏幕上方弹出，避免因为页面滚动而被忽略。
 */
export function AdminToast({ toast, onClose }: AdminToastProps) {
  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  return (
    <div className="admin-toast-stack" role="status" aria-live="polite">
      <div className={`admin-toast admin-toast--${toast.type}`}>
        <span>{toast.message}</span>
        <button type="button" className="admin-toast__close" aria-label="关闭提示" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}
