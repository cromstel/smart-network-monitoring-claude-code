import type { Metadata, Viewport } from 'next'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: { default: 'Network Monitor', template: '%s · Network Monitor' },
  description: 'Self-hosted monitor for every device on your network.',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070a0f' },
    { media: '(prefers-color-scheme: light)', color: '#f3f1ec' },
  ],
}

/** Applies the stored theme before first paint, so there is no light/dark flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('snm-theme')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){document.documentElement.classList.add('dark')}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
