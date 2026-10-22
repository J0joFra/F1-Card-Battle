package com.j0jofra.f1cardbattle;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.PlayGamesSdk;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
        // Play Games Services: all'avvio il giocatore entra in automatico con il suo account Play Giochi
        PlayGamesSdk.initialize(this);
    }
}
