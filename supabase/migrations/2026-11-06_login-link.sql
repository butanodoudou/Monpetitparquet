-- Connexion par pseudo et lien personnel : plus d'e-mail ni de mot de passe obligatoires.
-- Le lien est signé côté serveur et n'est pas stocké. login_version permet de l'annuler.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_version INTEGER NOT NULL DEFAULT 1;

-- « Duyen » et « duyen » ne doivent pas pouvoir coexister : le pseudo est la seule identité visible.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));
