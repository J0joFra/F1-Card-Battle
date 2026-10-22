package com.j0jofra.f1cardbattle;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.games.AchievementsClient;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import java.security.MessageDigest;
import org.json.JSONException;
import org.json.JSONObject;

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
                    else call.reject("not_signed_in: " + describe(signIn.getException()) + diagnostics());
                });
            } else {
                call.reject("not_signed_in");
            }
        });
    }

    // Obiettivi raggiunti: quelli incrementali con i passi fatti (Play Giochi tiene il massimo), gli altri si sbloccano.
    @PluginMethod
    public void reportAchievements(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null) {
            call.reject("no_items");
            return;
        }
        PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnCompleteListener(auth -> {
            if (!auth.isSuccessful() || !auth.getResult().isAuthenticated()) {
                call.reject("not_signed_in");
                return;
            }
            AchievementsClient achievements = PlayGames.getAchievementsClient(getActivity());
            try {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    String id = item.getString("id");
                    int steps = item.optInt("steps", 0);
                    if (steps > 0) achievements.setSteps(id, steps);
                    else achievements.unlock(id);
                }
                call.resolve();
            } catch (JSONException e) {
                call.reject("bad_items: " + e.getMessage());
            }
        });
    }

    // schermata degli obiettivi di Play Giochi
    @PluginMethod
    public void showAchievements(PluginCall call) {
        PlayGames.getAchievementsClient(getActivity())
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> {
                getActivity().startActivityForResult(intent, ACHIEVEMENTS_REQUEST);
                call.resolve();
            })
            .addOnFailureListener(e -> call.reject(describe(e)));
    }

    private static final int ACHIEVEMENTS_REQUEST = 9003;

    private void request(GamesSignInClient client, PluginCall call) {
        String serverClientId = getContext().getString(R.string.play_games_server_client_id);
        client.requestServerSideAccess(serverClientId, false).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                JSObject res = new JSObject();
                res.put("code", task.getResult());
                call.resolve(res);
            } else {
                call.reject("no_code: " + describe(task.getException()) + diagnostics());
            }
        });
    }

    // motivo dell'errore di Play Giochi, per capire cosa non va nella configurazione
    private static String describe(Exception e) {
        return e == null ? "rifiutato da Google" : e.getClass().getSimpleName() + " " + e.getMessage();
    }

    // Quello che Google confronta con la configurazione di Play Giochi: pacchetto, impronta SHA-1 della firma
    // con cui è stata installata l'app, APP_ID e stato di Google Play Services (0 = ok).
    private String diagnostics() {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= 28) {
                SigningInfo info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo;
                sigs = info.hasMultipleSigners() ? info.getApkContentsSigners() : info.getSigningCertificateHistory();
            } else {
                sigs = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES).signatures;
            }
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(sigs[sigs.length - 1].toByteArray());
            StringBuilder sha1 = new StringBuilder();
            for (byte b : digest) sha1.append(sha1.length() > 0 ? ":" : "").append(String.format("%02X", b));
            ApplicationInfo app = pm.getApplicationInfo(pkg, PackageManager.GET_META_DATA);
            Object appId = app.metaData == null ? null : app.metaData.get("com.google.android.gms.games.APP_ID");
            int gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx);
            return " | pacchetto " + pkg + " | SHA-1 " + sha1 + " | APP_ID " + appId + " | Play Services " + gms;
        } catch (Exception e) {
            return " | diagnosi non riuscita: " + e.getMessage();
        }
    }
}
