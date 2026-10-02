package io.github.pchessman.pacmanversus;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.SparseArray;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;

/**
 * Pac-Man Versus for Android TV / Google TV.
 *
 * The game is the same web app as the desktop version, bundled inside the APK and
 * served from a virtual https origin by WebViewAssetLoader. Nothing is loaded from
 * the network (the app does not even request the INTERNET permission).
 *
 * Controllers: every gamepad event is handled here, per physical device, and passed
 * to the game as "device N pressed X". The game gives the first controller P1 and the
 * second P2, so one controller can only ever move one player. Gamepad events are
 * consumed here, so the WebView never turns them into shared arrow-key presses.
 * The TV remote's D-pad and OK button still reach the page as normal keys.
 *
 * Security: no JavaScript-to-Java bridge is exposed. The only calls into the page are
 * fixed strings built from integers and whitelisted words.
 */
public class MainActivity extends Activity implements InputManager.InputDeviceListener {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html?tv=1";

    private WebView web;
    private InputManager inputManager;

    // Current direction per controller, from each input kind, and the last one sent.
    private final SparseArray<String> keyDir = new SparseArray<>();
    private final SparseArray<String> hatDir = new SparseArray<>();
    private final SparseArray<String> stickDir = new SparseArray<>();
    private final SparseArray<String> sentDir = new SparseArray<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // high score, settings
        s.setMediaPlaybackRequiresUserGesture(false); // sound starts with a controller press
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) {
                    // Anything that isn't one of the game's own files gets an empty answer.
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return loader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost()); // never navigate away
            }
        });

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        setContentView(web);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        web.loadUrl(START_URL);

        inputManager = (InputManager) getSystemService(Context.INPUT_SERVICE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        web.onResume();
        web.resumeTimers();
        inputManager.registerInputDeviceListener(this, null);
    }

    @Override
    protected void onPause() {
        inputManager.unregisterInputDeviceListener(this);
        web.onPause(); // the page pauses the game itself when it loses visibility
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /* ---------------- input ---------------- */

    private static boolean isController(InputEvent e) {
        InputDevice d = e.getDevice();
        if (d == null || d.isVirtual()) return false;
        int src = d.getSources();
        return (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (isController(e)) {
            handleControllerKey(e);
            return true; // consumed: never becomes a shared arrow key in the page
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) goBack();
            return true;
        }
        return super.dispatchKeyEvent(e); // TV remote D-pad / OK go to the page as keys
    }

    private void handleControllerKey(KeyEvent e) {
        int id = e.getDeviceId();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        if (down && e.getRepeatCount() > 0) return;
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP:    keyDirection(id, down, "up"); break;
            case KeyEvent.KEYCODE_DPAD_DOWN:  keyDirection(id, down, "down"); break;
            case KeyEvent.KEYCODE_DPAD_LEFT:  keyDirection(id, down, "left"); break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: keyDirection(id, down, "right"); break;
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_DPAD_CENTER: if (down) send(id, "btn", "a"); break;
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BACK:        if (down) send(id, "btn", "b"); break;
            case KeyEvent.KEYCODE_BUTTON_X:    if (down) send(id, "btn", "x"); break;
            case KeyEvent.KEYCODE_BUTTON_Y:    if (down) send(id, "btn", "y"); break;
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU:        if (down) send(id, "btn", "menu"); break;
            case KeyEvent.KEYCODE_BUTTON_SELECT: if (down) send(id, "btn", "view"); break;
            default: break;
        }
    }

    private void keyDirection(int id, boolean down, String dir) {
        if (down) keyDir.put(id, dir);
        else if (dir.equals(keyDir.get(id))) keyDir.remove(id);
        updateDirection(id);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (isController(e) && e.getAction() == MotionEvent.ACTION_MOVE) {
            int id = e.getDeviceId();
            hatDir.put(id, axisDirection(e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), 0.5f));
            // a little hysteresis so a resting stick doesn't flicker
            float threshold = stickDir.get(id) != null ? 0.35f : 0.5f;
            stickDir.put(id, axisDirection(e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), threshold));
            updateDirection(id);
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    private static String axisDirection(float x, float y, float threshold) {
        if (Math.max(Math.abs(x), Math.abs(y)) < threshold) return null;
        if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
        return y > 0 ? "down" : "up";
    }

    // D-pad buttons win over the hat, which wins over the stick.
    private void updateDirection(int id) {
        String dir = keyDir.get(id);
        if (dir == null) dir = hatDir.get(id);
        if (dir == null) dir = stickDir.get(id);
        String out = dir == null ? "none" : dir;
        if (out.equals(sentDir.get(id))) return;
        sentDir.put(id, out);
        send(id, "dir", out);
    }

    // kind and value are always one of the fixed words above; id is an integer.
    private void send(int id, String kind, String value) {
        if (web == null) return;
        web.evaluateJavascript("window.__tvPad&&window.__tvPad(" + id + ",'" + kind + "','" + value + "')", null);
    }

    private void goBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.__tvBack?window.__tvBack():'exit'", result -> {
            if ("\"exit\"".equals(result)) finish();
        });
    }

    /* ---------------- controllers coming and going ---------------- */

    @Override
    public void onInputDeviceAdded(int deviceId) { }

    @Override
    public void onInputDeviceChanged(int deviceId) { }

    @Override
    public void onInputDeviceRemoved(int deviceId) {
        keyDir.remove(deviceId);
        hatDir.remove(deviceId);
        stickDir.remove(deviceId);
        sentDir.remove(deviceId);
        send(deviceId, "gone", "x");
    }
}
