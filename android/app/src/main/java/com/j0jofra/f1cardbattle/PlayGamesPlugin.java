package com.j0jofra.f1cardbattle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;

/**
 * Play Giochi per il gioco web: dà un codice monouso dell'account Play Giochi del giocatore. Il server lo
 * scambia con Google per sapere chi è, e così lo fa rientrare nel suo account anche su un telefono nuovo.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    @PluginMethod
    public void serverAuthCode(PluginCall call) {
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        client.isAuthenticated().addOnCompleteListener(auth -> {
            if (auth.isSuccessful() && auth.getResult().isAuthenticated()) {
                request(client, call);
            } else if (interactive) {
                // accesso chiesto dal giocatore (es. dalle impostazioni): si mostra la finestra di Play Giochi
                client.signIn().addOnCompleteListener(signIn -> {
                    if (signIn.isSuccessful() && signIn.getResult().isAuthenticated()) request(client, call);
                    else call.reject("not_signed_in: " + describe(signIn.getException()));
                });
            } else {
                call.reject("not_signed_in");
            }
        });
    }

    private void request(GamesSignInClient client, PluginCall call) {
        String serverClientId = getContext().getString(R.string.play_games_server_client_id);
        client.requestServerSideAccess(serverClientId, false).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                JSObject res = new JSObject();
                res.put("code", task.getResult());
                call.resolve(res);
            } else {
                call.reject("no_code: " + describe(task.getException()));
            }
        });
    }

    // motivo dell'errore di Play Giochi, per capire cosa non va nella configurazione
    private static String describe(Exception e) {
        return e == null ? "annullato" : e.getClass().getSimpleName() + " " + e.getMessage();
    }
}
