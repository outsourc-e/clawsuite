module.exports = {
  appId: 'com.clawsuite.app',
  productName: 'ClawSuite',
  copyright: 'Copyright © 2026 ClawSuite',
  electronVersion: '40.8.2',
  npmRebuild: false,
  asar: false,
  icon: 'assets/icon',
  directories: { output: 'release', buildResources: 'assets' },
  files: ['**/*', '!node_modules'],
  extraResources: [
    { from: 'assets', to: 'assets', filter: ['**/*'] },
  ],
  mac: {
    icon: 'assets/icon.icns',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    darkModeSupport: true,
  },
  dmg: {
    title: 'ClawSuite',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
};
