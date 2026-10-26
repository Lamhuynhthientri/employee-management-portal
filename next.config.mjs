/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Observe before enforcing: Google Auth, FCM, and PWA must keep working.
      { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.google.com https://*.gstatic.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google.com https://*.firebaseapp.com https://*.gstatic.com https://vitals.vercel-insights.com; frame-src 'self' https://*.firebaseapp.com https://*.google.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
    ] }]
  },
}

export default nextConfig
