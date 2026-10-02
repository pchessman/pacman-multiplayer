package io.github.pchessman.pacmanversus;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.util.SparseArray;
import android.util.SparseIntArray;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.util.Arrays;

/**
 * Pac-Man Versus for Android TV / Google TV.
 *
 * The game is the same web app as the desktop version, bundled inside the APK and
 * served from a virtual https origin by WebViewAssetLoader. Nothing is loaded from
 * the network (the app does not even request the INTERNET permission).
 *
 * Controllers: every gamepad event is handled here, per physical device, and passed
 * to the game as "device N did X". The game gives the first controller P1 and the
 * second P2, so one controller can only ever move one player, and it applies each
 * player's button bindings. Gamepad events are consumed here, so the WebView never
 * turns them into shared arrow-key presses. The TV remote's D-pad and OK button
 * still reach the page as normal keys.
 *
 * Security: no JavaScript-to-Java bridge is exposed. The only calls into the page are
 * fixed strings built from integers and whitelisted words.
 */
public class MainActivity extends Activity implements InputManager.InputDeviceListener {

    private static final String TAG = "PacManVersus";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html?tv=1";
    private static final long SPLASH_MAX_MS = 2500;
    private static final long AXES_INTERVAL_MS = 33; // live stick values for the test screen, ~30 a second

    private WebView web;
    private InputManager inputManager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private OnBackInvokedCallback backCallback;

    // Splash: held until the page has painted its first frame (or a short timeout).
    private boolean pageVisible;
    private long splashDeadline;

    // Renderer crashes: rebuild the WebView, but give up if it keeps happening.
    private long lastCrash;
    private int crashes;

    // Per controller: current direction from each input kind, what was last sent,
    // trigger buttons held, last stick values sent and when, and whether we said hello.
    private final SparseArray<String> keyDir = new SparseArray<>();
    private final SparseArray<String> hatDir = new SparseArray<>();
    private final SparseArray<String> sentDpad = new SparseArray<>();
    private final SparseArray<String> stickDir = new SparseArray<>();
    private final SparseArray<String> sentStick = new SparseArray<>();
    private final SparseIntArray triggers = new SparseIntArray(); // bit 1 = LT, bit 2 = RT
    private final SparseArray<int[]> axes = new SparseArray<>();
    private final SparseArray<int[]> sentAxes = new SparseArray<>();
    private final SparseArray<Long> axesTime = new SparseArray<>();
    private final SparseArray<Runnable> axesPending = new SparseArray<>();
    private final SparseIntArray introduced = new SparseIntArray();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        createWebView();
        holdSplash();

        inputManager = (InputManager) getSystemService(Context.INPUT_SERVICE);

        // Android 13+: Back arrives through the back-callback API (KEYCODE_BACK is no
        // longer delivered to apps that target Android 16+).
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::goBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    private void createWebView() {
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        configure(web.getSettings());
        if (Build.VERSION.SDK_INT >= 26) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) {
                    // Anything that isn't one of the game's own files gets an empty answer.
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return loader.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost()); // never navigate away
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                releaseSplash();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's renderer crashed or was killed to free memory. Returning true
                // keeps the app alive; we then replace the dead WebView with a fresh one.
                if (view != web) return true;
                long now = SystemClock.uptimeMillis();
                crashes = now - lastCrash < 15000 ? crashes + 1 : 1;
                lastCrash = now;
                Log.w(TAG, "WebView renderer gone (crash=" + (Build.VERSION.SDK_INT >= 26 && detail.didCrash()) + "), restarting");
                destroyWebView();
                if (crashes > 3) { finish(); return true; }
                createWebView();
                web.requestFocus();
                return true;
            }
        });

        // Deny anything the page might ask for: camera, mic, popups, file pickers.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) { request.deny(); }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return false;
            }
        });

        setContentView(web);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        web.loadUrl(START_URL);
    }

    @SuppressWarnings("deprecation")
    private static void configure(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // high score, settings, bindings
        s.setMediaPlaybackRequiresUserGesture(false); // sound starts with a controller press
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                           // system font scaling would break the layout
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);    // everything is local anyway
    }

    private void destroyWebView() {
        if (web == null) return;
        handler.removeCallbacksAndMessages(null);
        WebView dead = web;
        web = null;
        if (dead.getParent() instanceof android.view.ViewGroup) {
            ((android.view.ViewGroup) dead.getParent()).removeView(dead);
        }
        dead.destroy();
        clearControllerState();
    }

    /* ---------------- splash ---------------- */

    // Keep the system splash (Android 12+) up until the page has drawn its loading screen,
    // then let the splash icon zoom away.
    private void holdSplash() {
        splashDeadline = SystemClock.uptimeMillis() + SPLASH_MAX_MS;
        final View content = findViewById(android.R.id.content);
        content.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                if (pageVisible || SystemClock.uptimeMillis() >= splashDeadline) {
                    content.getViewTreeObserver().removeOnPreDrawListener(this);
                    return true;
                }
                return false;
            }
        });
        handler.postDelayed(this::releaseSplash, SPLASH_MAX_MS);
        if (Build.VERSION.SDK_INT >= 31) {
            getSplashScreen().setOnExitAnimationListener(view -> view.animate()
                    .alpha(0f).scaleX(1.6f).scaleY(1.6f)
                    .setDuration(260)
                    .withEndAction(view::remove)
                    .start());
        }
    }

    private void releaseSplash() {
        if (pageVisible) return;
        pageVisible = true;
        View content = findViewById(android.R.id.content);
        if (content != null) content.invalidate();
    }

    /* ---------------- lifecycle ---------------- */

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
        call("window.__tvLife&&window.__tvLife('resume')");
        inputManager.registerInputDeviceListener(this, handler);
    }

    @Override
    protected void onPause() {
        inputManager.unregisterInputDeviceListener(this);
        // pause the match and silence all audio before going to the background
        call("window.__tvLife&&window.__tvLife('pause')");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        destroyWebView();
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
        // Back (remote or controller): before Android 13 it arrives as a key; from 13 on the
        // system sends it straight to backCallback instead.
        if (Build.VERSION.SDK_INT < 33 && e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) goBack();
            return true;
        }
        if (isController(e)) {
            handleControllerKey(e);
            return true; // consumed: never becomes a shared arrow key in the page
        }
        return super.dispatchKeyEvent(e); // TV remote D-pad / OK go to the page as keys
    }

    private void handleControllerKey(KeyEvent e) {
        int id = e.getDeviceId();
        introduce(e.getDevice());
        int action = e.getAction();
        if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) return;
        boolean down = action == KeyEvent.ACTION_DOWN;
        if (down && e.getRepeatCount() > 0) return;
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP:    keyDirection(id, down, "up"); break;
            case KeyEvent.KEYCODE_DPAD_DOWN:  keyDirection(id, down, "down"); break;
            case KeyEvent.KEYCODE_DPAD_LEFT:  keyDirection(id, down, "left"); break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: keyDirection(id, down, "right"); break;
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_DPAD_CENTER: button(id, down, "a"); break;
            case KeyEvent.KEYCODE_BUTTON_B:    button(id, down, "b"); break;
            case KeyEvent.KEYCODE_BUTTON_X:    button(id, down, "x"); break;
            case KeyEvent.KEYCODE_BUTTON_Y:    button(id, down, "y"); break;
            case KeyEvent.KEYCODE_BUTTON_L1:   button(id, down, "lb"); break;
            case KeyEvent.KEYCODE_BUTTON_R1:   button(id, down, "rb"); break;
            case KeyEvent.KEYCODE_BUTTON_L2:   trigger(id, 1, down); break;
            case KeyEvent.KEYCODE_BUTTON_R2:   trigger(id, 2, down); break;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: button(id, down, "ls"); break;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: button(id, down, "rs"); break;
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU:        button(id, down, "menu"); break;
            case KeyEvent.KEYCODE_BUTTON_SELECT: button(id, down, "view"); break;
            default: break;
        }
    }

    private void button(int id, boolean down, String name) {
        send(id, down ? "down" : "up", name);
    }

    // Triggers arrive as keys on some controllers and as axes on others (Xbox: axes).
    private void trigger(int id, int bit, boolean down) {
        int before = triggers.get(id);
        int after = down ? before | bit : before & ~bit;
        if (after == before) return;
        triggers.put(id, after);
        button(id, down, bit == 1 ? "lt" : "rt");
    }

    private void keyDirection(int id, boolean down, String dir) {
        if (down) keyDir.put(id, dir);
        else if (dir.equals(keyDir.get(id))) keyDir.remove(id);
        updateDpad(id);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (isController(e) && e.getAction() == MotionEvent.ACTION_MOVE) {
            int id = e.getDeviceId();
            introduce(e.getDevice());
            hatDir.put(id, axisDirection(e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), 0.5f));
            updateDpad(id);
            // a little hysteresis so a resting stick doesn't flicker
            float threshold = stickDir.get(id) != null ? 0.35f : 0.5f;
            float lx = e.getAxisValue(MotionEvent.AXIS_X), ly = e.getAxisValue(MotionEvent.AXIS_Y);
            stickDir.put(id, axisDirection(lx, ly, threshold));
            updateStick(id);
            float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
            float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
            int held = triggers.get(id);
            trigger(id, 1, lt > ((held & 1) != 0 ? 0.3f : 0.5f));
            trigger(id, 2, rt > ((held & 2) != 0 ? 0.3f : 0.5f));
            sendAxes(id, new int[] {
                    pct(lx), pct(ly),
                    pct(e.getAxisValue(MotionEvent.AXIS_Z)), pct(e.getAxisValue(MotionEvent.AXIS_RZ)),
                    pct(lt), pct(rt) });
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    private static int pct(float v) {
        if (Float.isNaN(v)) return 0;
        return Math.max(-100, Math.min(100, Math.round(v * 20) * 5)); // steps of 5%: fewer updates
    }

    private static String axisDirection(float x, float y, float threshold) {
        if (Math.max(Math.abs(x), Math.abs(y)) < threshold) return null;
        if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
        return y > 0 ? "down" : "up";
    }

    // D-pad buttons win over the hat (some controllers report the D-pad as one, some the other).
    private void updateDpad(int id) {
        String dir = keyDir.get(id);
        if (dir == null) dir = hatDir.get(id);
        String out = dir == null ? "none" : dir;
        if (out.equals(sentDpad.get(id))) return;
        sentDpad.put(id, out);
        send(id, "dpad", out);
    }

    private void updateStick(int id) {
        String dir = stickDir.get(id);
        String out = dir == null ? "none" : dir;
        if (out.equals(sentStick.get(id))) return;
        sentStick.put(id, out);
        send(id, "stick", out);
    }

    // Live analog values, only for the controller test screen: sent when they change,
    // at most ~30 times a second per controller, always ending on the latest value.
    private void sendAxes(final int id, int[] values) {
        axes.put(id, values);
        if (Arrays.equals(values, sentAxes.get(id)) || axesPending.get(id) != null) return;
        long now = SystemClock.uptimeMillis();
        Long last = axesTime.get(id);
        long wait = last == null ? 0 : Math.max(0, last + AXES_INTERVAL_MS - now);
        Runnable flush = () -> {
            axesPending.remove(id);
            int[] v = axes.get(id);
            if (v == null || Arrays.equals(v, sentAxes.get(id))) return;
            sentAxes.put(id, v.clone());
            axesTime.put(id, SystemClock.uptimeMillis());
            call("window.__tvPad&&window.__tvPad(" + id + ",'axes'," + v[0] + "," + v[1] + "," + v[2] + ","
                    + v[3] + "," + v[4] + "," + v[5] + ")");
        };
        if (wait == 0) flush.run();
        else {
            axesPending.put(id, flush);
            handler.postDelayed(flush, wait);
        }
    }

    // Tell the page what kind of controller this is (vendor id only, never its name).
    private void introduce(InputDevice d) {
        if (d == null || introduced.get(d.getId()) != 0) return;
        introduced.put(d.getId(), 1);
        int vendor = Math.max(0, Math.min(0xffff, d.getVendorId()));
        call("window.__tvPad&&window.__tvPad(" + d.getId() + ",'info'," + vendor + ")");
    }

    // kind and value are always one of the fixed words above; id is an integer.
    private void send(int id, String kind, String value) {
        call("window.__tvPad&&window.__tvPad(" + id + ",'" + kind + "','" + value + "')");
    }

    private void call(String js) {
        if (web != null) web.evaluateJavascript(js, null);
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
        forget(deviceId);
        call("window.__tvPad&&window.__tvPad(" + deviceId + ",'gone','x')");
    }

    private void forget(int id) {
        keyDir.remove(id);
        hatDir.remove(id);
        sentDpad.remove(id);
        stickDir.remove(id);
        sentStick.remove(id);
        triggers.delete(id);
        axes.remove(id);
        sentAxes.remove(id);
        axesTime.remove(id);
        Runnable r = axesPending.get(id);
        if (r != null) handler.removeCallbacks(r);
        axesPending.remove(id);
        introduced.delete(id);
    }

    private void clearControllerState() {
        keyDir.clear(); hatDir.clear(); sentDpad.clear(); stickDir.clear(); sentStick.clear();
        triggers.clear(); axes.clear(); sentAxes.clear(); axesTime.clear(); axesPending.clear(); introduced.clear();
    }
}
