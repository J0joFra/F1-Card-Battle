import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.j0jofra.f1cardbattle',
  appName: 'F1 Card Battle',
  webDir: 'dist',
  android: {
    backgroundColor: '#0e0f13',
  },
  plugins: {
    // Login nativo: solo Google (gli altri provider non vengono inclusi nell'app)
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
  },
};

export default config;
