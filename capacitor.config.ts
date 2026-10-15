import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.j0jofra.f1cardbattle',
  appName: 'F1 Card Battle',
  webDir: 'dist',
  android: {
    backgroundColor: '#0e0f13',
  },
  plugins: {
    // Login nativo con Google. Apple resta incluso solo perché il plugin ne ha bisogno per risolvere
    // la libreria androidx.browser (non aggiunge SDK esterni); Facebook e Twitter sono esclusi.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: true, twitter: false },
    },
  },
};

export default config;
