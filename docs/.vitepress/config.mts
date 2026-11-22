import { defineConfig } from 'vitepress';

const repo = 'https://github.com/Subramanyarao11/react-native-nexconn';

export default defineConfig({
  title: 'React Native Nexconn',
  description:
    'Community React Native SDK for Nexconn Chat: typed client, React hooks, Expo config plugin.',
  base: '/react-native-nexconn/',
  cleanUrls: true,
  lastUpdated: true,
  // Development records (cloud test sessions, build plan) stay in the repo.
  srcExclude: ['internal/**'],
  head: [
    ['meta', { name: 'theme-color', content: '#1565c0' }],
    ['link', { rel: 'icon', href: '/react-native-nexconn/logo.svg' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/quickstart' },
      { text: 'Hooks', link: '/guide/react' },
      { text: 'API', link: '/guide/api' },
      { text: 'Status', link: '/reference/status' },
      {
        text: 'Links',
        items: [
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'Contributing', link: `${repo}/blob/main/CONTRIBUTING.md` },
          {
            text: 'npm',
            link: 'https://www.npmjs.com/package/@subramanyarao11/react-native-nexconn',
          },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Quickstart', link: '/guide/quickstart' },
          { text: 'Client API', link: '/guide/api' },
          { text: 'React hooks', link: '/guide/react' },
          { text: 'Push notifications', link: '/guide/push' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Platform parity', link: '/reference/parity' },
          { text: 'Compared with Flutter', link: '/reference/flutter' },
          { text: 'Bridge protocol', link: '/reference/bridge-protocol' },
          { text: 'Verification status', link: '/reference/status' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    outline: [2, 3],
    footer: {
      message:
        'MIT licensed community project. Not affiliated with or endorsed by Nexconn or RongCloud.',
      copyright: 'Copyright © 2026 Subramanya',
    },
  },
});
