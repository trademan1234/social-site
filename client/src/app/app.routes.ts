import { Routes } from '@angular/router';

// Pages chargées à la demande (lazy loading) pour un premier affichage rapide
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.page'), title: 'Pulse – Partage tes moments' },
  { path: 'u/:name', loadComponent: () => import('./pages/profile.page'), title: 'Profil – Pulse' },
  { path: '**', redirectTo: '' },
];
