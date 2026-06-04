interface AdminUnsavedNoticeProps {
  visible: boolean;
}

/**
 * 后台固定未保存提醒。
 * 页面存在本地草稿改动时固定显示在右下角，提醒运营当前仍有待提交内容。
 */
export function AdminUnsavedNotice({ visible }: AdminUnsavedNoticeProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="admin-unsaved-notice" role="status" aria-live="polite">
      含有未保存更改
    </div>
  );
}
