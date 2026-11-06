'use client';
import { useEffect, useState, type ReactNode } from 'react';

// La session vit dans le navigateur : rendre l'app côté serveur donnerait un écran différent
// de celui du client et casserait l'hydratation.
export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
