// @/api/oss — 文件上传到对象存储。
//
// uploadImage(file) 接受一个 File，返回一个 Promise<string>，是 blob: URL，
// 可直接用作 <img src=...>。调用方应在不再需要时调用 release(url) 释放
// 底层 File 引用（否则浏览器会一直持有原文件对象直到页面卸载）。
//
// 上传到真实 OSS 时，可在此处包装为：
//   1. PUT /v1/oss/sign  → 拿到预签名 URL
//   2. 直接 fetch(file) 上传到 OSS
//   3. 返回最终可访问的 CDN URL
// 当前 stub 实现仅在本地构造 blob URL。

export function uploadImage(file: File | Blob): Promise<string> {
  return Promise.resolve(URL.createObjectURL(file))
}

export function release(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export default { uploadImage, release }
