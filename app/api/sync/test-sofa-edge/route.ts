export const runtime = 'edge';

export async function GET() {
  const res = await fetch(
    'https://api.sofascore.com/api/v1/unique-tournament/156/season/79100/teams',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
        'Accept': 'application/json, text/plain, */*',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
      },
    }
  );
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text.slice(0, 500) }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
