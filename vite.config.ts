import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { SUPABASE_URL } from './src/config'

// GitHub Pages не отдаёт заголовки — политика безопасности кладётся в <meta>.
function cspMeta(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.cloudflare.steamstatic.com",
    `connect-src 'self' ${SUPABASE_URL}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ')
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`),
  }
}

export default defineConfig({
  // сайт живёт в подпапке GitHub Pages: alievabdulxalik8-del.github.io/who-ruined-2/
  base: '/who-ruined-2/',
  plugins: [react(), cspMeta()],
  // время сборки внизу страницы — видно, открыта ли свежая версия
  define: {
    __BUILD__: JSON.stringify(new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
  },
})
