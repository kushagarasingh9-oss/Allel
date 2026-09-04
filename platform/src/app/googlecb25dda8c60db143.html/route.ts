export const dynamic = 'force-static'

export function GET() {
  return new Response('google-site-verification: googlecb25dda8c60db143.html', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
