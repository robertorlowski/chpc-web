import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // starsze testy wołają API bez logowania; testy kont (auth.test.ts) włączają je same
    env: { AUTH_DISABLED: '1' },
  }
})