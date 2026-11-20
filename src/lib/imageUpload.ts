/**
 * V2.0 采购凭证图片处理。
 *
 * 本地演示使用 localStorage 持久化，容量有限（约 5MB），
 * 因此上传前必须压缩图片：限制最长边并转为 JPEG，避免一张截图就把整份数据撑爆。
 */

/** 压缩后的最长边（像素） */
export const VOUCHER_IMAGE_MAX_EDGE = 1024
/** 压缩后的 JPEG 质量 */
export const VOUCHER_IMAGE_QUALITY = 0.72
/** 单张凭证图片的 data URL 字符数上限（约 400KB ASCII 内容） */
export const VOUCHER_IMAGE_MAX_BYTES = 400 * 1024
/** 所有凭证图片合计的 data URL 字符数上限；为其他业务数据预留 localStorage 空间 */
export const VOUCHER_IMAGES_TOTAL_MAX_CHARS = 1200 * 1024

export interface PreparedImage {
  dataUrl: string
  name: string
  /** 原始文件大小（字节） */
  originalBytes: number
}

export class ImageUploadError extends Error {}

/** 读取图片文件并压缩为适合本地存储的 data URL */
export function prepareVoucherImage(file: File): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new ImageUploadError('请选择图片文件。'))
      return
    }
    const originalBytes = file.size
    if (originalBytes > 12 * 1024 * 1024) {
      reject(new ImageUploadError('图片过大（超过 12MB），请压缩后再上传。'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new ImageUploadError('图片读取失败，请重试。'))
    reader.onload = () => {
      const source = String(reader.result ?? '')
      const image = new Image()
      image.onerror = () => reject(new ImageUploadError('无法解析该图片，请换一张试试。'))
      image.onload = () => {
        const scale = Math.min(1, VOUCHER_IMAGE_MAX_EDGE / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new ImageUploadError('当前浏览器无法处理图片。'))
          return
        }
        context.drawImage(image, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', VOUCHER_IMAGE_QUALITY)
        if (dataUrl.length > VOUCHER_IMAGE_MAX_BYTES) {
          reject(new ImageUploadError('图片压缩后仍然过大，请换一张更小的图片。'))
          return
        }
        resolve({ dataUrl, name: file.name, originalBytes })
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  })
}
