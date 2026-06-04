/**
 * 头像裁剪相关的纯逻辑。
 * 与 DOM/Canvas 解耦，便于单元测试；真正的画布绘制由组件层完成。
 */

/** 裁剪区矩形，单位为像素。 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 计算一个居中的最大正方形裁剪区。
 * 头像统一按 1:1 裁剪，初始选区取图片短边构成的居中正方形。
 */
export function buildCenteredSquareCrop(naturalWidth: number, naturalHeight: number): CropRect {
  const side = Math.max(0, Math.min(naturalWidth, naturalHeight));
  return {
    x: Math.round((naturalWidth - side) / 2),
    y: Math.round((naturalHeight - side) / 2),
    width: side,
    height: side,
  };
}

/**
 * 从 data URL 中提取纯 base64 内容。
 * 上传接口只接收 base64 正文，因此需要剥离 "data:image/png;base64," 前缀。
 */
export function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return dataUrl;
  }
  return dataUrl.slice(commaIndex + 1);
}
