// js/compress.js — 上传前压缩：长边 2000px、JPEG 85%（化验单文字肉眼清晰，体积约 1-2MB）
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error(`无法读取「${file.name}」，请换一张图片（或先截图再上传）`)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('图片压缩失败，请重试')
  return blob
}
