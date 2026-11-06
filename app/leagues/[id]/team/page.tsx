'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** L'équipe, c'est le cinq aligné : on y renvoie directement. */
export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => { router.replace(`/leagues/${id}/lineup`); }, [id, router]);
  return null;
}
