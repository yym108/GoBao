import { useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { buildCenteredSquareCrop, dataUrlToBase64 } from '../lib/avatarCrop';

interface AvatarCropperModalProps {
  /** 待裁剪的本地图片对象 URL。 */
  imageSrc: string;
  /** 原始文件名，用于推断扩展名。 */
  fileName: string;
  /** 是否正在上传，用于禁用确认按钮。 */
  submitting: boolean;
  /** 取消裁剪。 */
  onCancel: () => void;
  /** 确认裁剪，回传裁剪后图片的 base64 与类型。 */
  onConfirm: (base64: string, mimeType: string, fileName: string) => void;
}

/**
 * 头像裁剪弹窗。
 * 统一按 1:1 裁剪并以圆形预览，确认后把选区绘制到画布导出为 PNG base64。
 */
export function AvatarCropperModal({ imageSrc, fileName, submitting, onCancel, onConfirm }: AvatarCropperModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [error, setError] = useState('');

  /**
   * 图片加载完成后，按短边构造一个居中的 1:1 初始选区（以百分比表示，适配缩放）。
   */
  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const rect = buildCenteredSquareCrop(naturalWidth, naturalHeight);
    setCrop({
      unit: '%',
      x: (rect.x / naturalWidth) * 100,
      y: (rect.y / naturalHeight) * 100,
      width: (rect.width / naturalWidth) * 100,
      height: (rect.height / naturalHeight) * 100,
    });
  }

  /**
   * 把当前选区绘制到画布并导出为 PNG base64。
   */
  function handleConfirm() {
    const image = imgRef.current;
    if (!image || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      setError('请先框选头像区域');
      return;
    }
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(completedCrop.width * scaleX);
    canvas.height = Math.floor(completedCrop.height * scaleY);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('当前浏览器不支持图片裁剪');
      return;
    }
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const base64 = dataUrlToBase64(canvas.toDataURL('image/png'));
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'avatar';
    onConfirm(base64, 'image/png', `${baseName}.png`);
  }

  return (
    <div className="avatar-cropper-backdrop" role="dialog" aria-modal="true">
      <div className="avatar-cropper card card--strong stack">
        <div className="hero__eyebrow">裁剪头像</div>
        <div className="muted">拖动选框选择头像区域，将以圆形展示。</div>

        <div className="avatar-cropper__canvas">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
            aspect={1}
            circularCrop
            keepSelection
          >
            <img ref={imgRef} src={imageSrc} alt="待裁剪头像" onLoad={handleImageLoad} style={{ maxHeight: '60vh' }} />
          </ReactCrop>
        </div>

        {error ? <div className="status status--error">{error}</div> : null}

        <div className="inline-actions">
          <button className="button button--primary" type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? '上传中...' : '确认并上传'}
          </button>
          <button className="button button--ghost" type="button" onClick={onCancel} disabled={submitting}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
