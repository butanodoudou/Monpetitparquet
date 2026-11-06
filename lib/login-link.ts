// Le jeton passe dans le fragment de l'URL (#) : il n'atteint ni le serveur ni les logs.
const TOKEN_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\d+\.[\w-]+/i;

export function loginUrl(loginToken: string): string {
  return `${window.location.origin}/auth#lien=${loginToken}`;
}

/** Retrouve le jeton dans un lien collé, un message entier ou le fragment de l'URL. */
export function extractLoginToken(text: string): string | null {
  return text.match(TOKEN_PATTERN)?.[0] ?? null;
}
