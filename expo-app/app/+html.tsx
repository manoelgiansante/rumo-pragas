import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
        {/* Light-only app: pin the browser canvas / form controls / scrollbars to
            light so a system dark-mode setting cannot paint a dark background
            before (or after) React hydrates. Runtime scheme is also forced light
            in app/_layout.tsx. */}
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#0B3D2E" />
        <title>Rumo Pragas IA</title>
        <ScrollViewStyleReset />
      </head>
      {/* Creme (#F7F3EC) background guards against a flash of dark canvas before
          React hydrates on browsers set to dark mode. */}
      <body style={{ backgroundColor: '#F7F3EC' }}>{children}</body>
    </html>
  );
}
