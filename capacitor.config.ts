import type { CapacitorConfig } from '@capacitor/cli';

// appId must match the package name registered in Play Console — change before first upload.
const config: CapacitorConfig = {
  appId: 'com.fillline.game',
  appName: 'Fill Line',
  webDir: 'dist',
  backgroundColor: '#101f2c',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
