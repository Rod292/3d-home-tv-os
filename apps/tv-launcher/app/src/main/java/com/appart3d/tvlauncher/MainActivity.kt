package com.appart3d.tvlauncher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.TransitionDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Home screen of the TV: the live 3D apartment on top (embedded web view served by the home bridge,
 * `?view=3d&lite=1&orbit=full&tilt=64`: a slow full turn around the living room, seen low), the lamps in a glass panel on its left, and an
 * Apple TV–like dock of a few chosen apps below. No ads, no recommendations.
 *
 * Provisioning over ADB (optional, the TV also finds the bridge with Bonjour and asks for the code):
 *   am start -n com.appart3d.tvlauncher/.MainActivity --es bridge http://<mac>:8787 --es pairCode <6 digits>
 */
class MainActivity : Activity() {
    private lateinit var store: BridgeStore
    private lateinit var catalog: AppCatalog
    private lateinit var discovery: BridgeDiscovery
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private lateinit var web: WebView
    private lateinit var heroMessage: TextView
    private lateinit var lights: LightsPanel
    private var feed: HomeFeed? = null
    private lateinit var dockScroll: HorizontalScrollView
    private lateinit var dock: LinearLayout
    private lateinit var pairPanel: FrameLayout
    private lateinit var pairInput: EditText
    private lateinit var pairStatus: TextView

    private var loadedUrl: String? = null
    private var heroFailed = false
    private var appsDirty = false
    private var ambientKey = Ambient.key(null)
    /** Extra query for the 3D from ADB (`--es heroExtra "&stats=1&maxDpr=1.5"`), for tuning; not persisted. */
    private var heroExtra = ""
    private val retry = Runnable { reconnect() }
    private val pendingDim = HashMap<String, Runnable>()

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            appsDirty = true
            if (hasWindowFocus()) showApps()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = BridgeStore(this)
        catalog = AppCatalog(this)
        discovery = BridgeDiscovery(this, ::onBridgeFound)
        setContentView(buildUi())
        registerReceiver(packageReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        })
        showApps()
        if (!handleProvisioning(intent)) connect()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (handleProvisioning(intent)) return
        // Home pressed while already home: back to the top, first app focused.
        if (pairPanel.visibility != View.VISIBLE) goTop()
    }

    override fun onResume() {
        super.onResume()
        HomeButtonGuard.ensure(this)
        web.onResume()
        web.resumeTimers()
        feed?.start()
        discovery.start()
        if (appsDirty) showApps()
        if (heroFailed) reconnect()
    }

    override fun onPause() {
        super.onPause()
        // An app is in front: stop the 3D rendering so it gets the whole (modest) GPU.
        web.onPause()
        web.pauseTimers()
        feed?.stop()
        discovery.stop()
    }

    override fun onDestroy() {
        unregisterReceiver(packageReceiver)
        main.removeCallbacksAndMessages(null)
        feed?.stop()
        web.destroy()
        io.shutdown()
        super.onDestroy()
    }

    @Deprecated("Home screen: Back only returns to the top.")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (pairPanel.visibility == View.VISIBLE && store.token != null) hidePairing() else goTop()
    }

    // region Bridge

    /** `--es bridge <url> --es pairCode <code>` from ADB. True when it handled a pairing. */
    private fun handleProvisioning(intent: Intent?): Boolean {
        // `--ef lat <deg> --ef lon <deg>`: where to read the weather. `--es dock "YouTube,Netflix,Plex"`: the dock's apps.
        if (intent?.hasExtra("lat") == true && intent.hasExtra("lon")) {
            WeatherSource.setPlace(this, intent.getFloatExtra("lat", 0f).toDouble(), intent.getFloatExtra("lon", 0f).toDouble())
        }
        intent?.getStringExtra("dock")?.let {
            catalog.setDock(it.split(',').map(String::trim).filter(String::isNotEmpty))
            showApps()
        }
        intent?.getStringExtra("heroExtra")?.let {
            heroExtra = it.filter { c -> c.isLetterOrDigit() || c in "&=._-" }
            reconnect()
        }
        intent?.getStringExtra("bridge")?.trim()?.trimEnd('/')?.takeIf { it.startsWith("http") }?.let {
            store.url = it
            loadedUrl = null
        }
        val code = intent?.getStringExtra("pairCode")?.trim() ?: return false
        intent.removeExtra("pairCode")
        submitCode(code)
        return true
    }

    /**
     * A bridge announced itself on the LAN. Keep the one we use while it answers: with two bridges on
     * the network (a test one, a neighbour's…) the TV must not flip to whichever was found last.
     */
    private fun onBridgeFound(url: String) {
        if (url == store.url) {
            if (heroFailed) reconnect()
            return
        }
        if (store.url != null && !heroFailed) return
        store.url = url
        reconnect()
    }

    private fun reconnect() {
        loadedUrl = null
        connect()
    }

    private fun connect() {
        main.removeCallbacks(retry)
        val base = store.url
        if (base == null) {
            showHeroMessage("Recherche de la maison sur le Wi-Fi…")
            if (store.token == null) showPairing()
            return
        }
        val token = store.token ?: return showPairing()
        // maxDpr=1.5: ~57 fps on this TV vs ~48 at 2x, hardly less sharp from the sofa (see ?stats=1).
        val url = "$base/?view=3d&lite=1&orbit=full&tilt=64&maxDpr=1.5$heroExtra"
        if (url == loadedUrl && !heroFailed) return
        startFeed(base, token)
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setCookie(base, "$COOKIE_NAME=$token; Path=/; Max-Age=31536000; SameSite=Lax") {
            cookies.flush()
            loadedUrl = url
            heroFailed = false
            web.animate().cancel()
            web.alpha = 0f
            web.loadUrl(url)
        }
    }

    private fun heroFailed(message: String) {
        heroFailed = true
        web.animate().alpha(0f).setDuration(300).start()
        showHeroMessage(message)
        main.removeCallbacks(retry)
        main.postDelayed(retry, 30_000)
    }

    private fun startFeed(base: String, token: String) {
        feed?.stop()
        feed = HomeFeed(
            base, token,
            onLamps = { lamps -> main.post { lights.setLamps(lamps) } },
            onLamp = { lamp -> main.post { lights.update(lamp) } },
            onSun = { elevation -> main.post { setSun(elevation) } },
            onScenes = { scenes -> main.post { lights.setScenes(scenes) } },
        ).also { it.start() }
    }

    /** Background palette follows the sun (day, golden hour, night), cross-faded when it changes. */
    private fun setSun(elevation: Double?) {
        val key = Ambient.key(elevation)
        if (key == ambientKey) return
        ambientKey = key
        val root = window.decorView.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val fade = TransitionDrawable(arrayOf(root.background, Ambient.forSun(elevation)))
        fade.isCrossFadeEnabled = true
        root.background = fade
        fade.startTransition(1500)
    }

    /** OK on a lamp: shows the new state at once, then the bridge's answer (or the old state on failure). */
    private fun toggle(lamp: Lamp) {
        val base = store.url ?: return
        val token = store.token ?: return
        val on = lamp.on != true
        lights.update(lamp.copy(on = on))
        io.execute {
            val result = runCatching { HomeFeed.power(base, token, lamp, on) }
            main.post {
                result.onSuccess { it?.let(lights::update) }.onFailure {
                    lights.update(lamp)
                    toast("${lamp.name} : commande impossible")
                }
            }
        }
    }

    /** ← / → on a lamp: shown at once, sent once the key is released for a moment (no flood while held). */
    private fun dim(lamp: Lamp, value: Int) {
        val base = store.url ?: return
        val token = store.token ?: return
        lights.update(lamp.copy(on = true, brightness = value))
        pendingDim.remove(lamp.id)?.let(main::removeCallbacks)
        val send = Runnable {
            pendingDim.remove(lamp.id)
            io.execute {
                val result = runCatching { HomeFeed.brightness(base, token, lamp, value) }
                main.post { result.onFailure { toast("${lamp.name} : réglage impossible") } }
            }
        }
        pendingDim[lamp.id] = send
        main.postDelayed(send, 250)
    }

    /** ← / → on the fan: motor speed, shown at once, sent once the key settles (like the dimmer). */
    private fun fanSpeed(lamp: Lamp, step: Int) {
        val base = store.url ?: return
        val token = store.token ?: return
        lights.update(lamp.copy(fanSpeed = step))
        pendingDim.remove(lamp.id)?.let(main::removeCallbacks)
        val send = Runnable {
            pendingDim.remove(lamp.id)
            io.execute {
                val result = runCatching { HomeFeed.fanSpeed(base, token, lamp, step) }
                main.post { result.onFailure { toast("Ventilateur : réglage impossible") } }
            }
        }
        pendingDim[lamp.id] = send
        main.postDelayed(send, 350)
    }

    private fun runScene(scene: Scene) {
        val base = store.url ?: return
        val token = store.token ?: return
        io.execute {
            val result = runCatching { HomeFeed.scene(base, token, scene.id) }
            main.post { result.onFailure { toast("Scène ${scene.name} : échec") } }
        }
    }

    /** "Tout éteindre": the lights only (the TV stays on, unlike the "Absent" scene). */
    private fun allOff() {
        lights.lamps().filter { it.on == true && it.reachable }.forEach(::toggle)
    }

    private fun unauthorized() {
        feed?.stop()
        feed = null
        store.token = null
        loadedUrl = null
        web.alpha = 0f
        showHeroMessage("TV non associée à la maison")
        showPairing()
    }

    private fun submitCode(raw: String) {
        val code = raw.filter(Char::isDigit)
        if (code.length != 6) return setPairStatus("Le code fait 6 chiffres.")
        val base = store.url ?: return setPairStatus("Maison introuvable sur le Wi-Fi pour l'instant…")
        setPairStatus("Association…")
        io.execute {
            val result = runCatching { BridgeApi.pair(base, code, "TV ${Build.MODEL}") }
            main.post {
                result.onSuccess { token ->
                    if (token == null) return@onSuccess setPairStatus("Code incorrect.")
                    store.token = token
                    hidePairing()
                    reconnect()
                }.onFailure { setPairStatus("Maison injoignable : ${it.message ?: "erreur réseau"}") }
            }
        }
    }

    /** Messages from the web page (`window.appart3dAndroid.postMessage`), on a WebView thread. */
    private inner class EmbedBridge {
        @JavascriptInterface
        fun postMessage(json: String) {
            val msg = runCatching { JSONObject(json) }.getOrNull() ?: return
            main.post {
                when (msg.optString("type")) {
                    "ready" -> {
                        heroMessage.animate().alpha(0f).setDuration(400).start()
                        web.animate().alpha(1f).setDuration(900).start()
                    }
                    "error" -> {
                        val text = msg.optString("message")
                        if (text.startsWith("Accès refusé")) unauthorized() else heroFailed(text.ifEmpty { "Maison injoignable" })
                    }
                }
            }
        }
    }

    // endregion

    // region UI

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUi(): View {
        val heroHeight = resources.displayMetrics.heightPixels - dp(DOCK_AREA)
        val root = FrameLayout(this).apply { background = Ambient.forSun(null) }

        // Hero: the 3D apartment, not focusable (display only).
        val hero = FrameLayout(this)
        root.addView(hero, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, heroHeight))
        heroMessage = TextView(this).apply {
            setTextColor(0x99FFFFFF.toInt())
            textSize = 20f
            gravity = Gravity.CENTER
        }
        hero.addView(heroMessage, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        web = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            alpha = 0f
            defaultFocusHighlightEnabled = false
            isFocusable = false
            isFocusableInTouchMode = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(EmbedBridge(), "appart3dAndroid")
            // `?stats=1` lines from the 3D (tuning): relayed to logcat, tag "Maison".
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    if (m.message().startsWith("[appart3d-stats]")) Log.i("Maison", m.message())
                    return true
                }
            }
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) heroFailed("Maison injoignable")
                }
                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (!request.isForMainFrame) return
                    if (response.statusCode == 401) unauthorized() else heroFailed("Maison injoignable (${response.statusCode})")
                }
            }
        }
        hero.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT).apply {
            leftMargin = dp(SIDE + PANEL_W)
        })
        lights = LightsPanel(this, ::toggle, ::dim, ::fanSpeed, ::runScene, ::allOff)
        hero.addView(lights, FrameLayout.LayoutParams(dp(PANEL_W), ViewGroup.LayoutParams.MATCH_PARENT).apply {
            leftMargin = dp(SIDE)
            topMargin = dp(28)
            bottomMargin = dp(28)
        })

        // Dock: one row of apps at the bottom, over the end of the 3D.
        dock = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            clipChildren = false
            clipToPadding = false
            setPadding(dp(SIDE), dp(28), dp(SIDE), dp(28))
        }
        dockScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isSmoothScrollingEnabled = true
            clipChildren = false
            clipToPadding = false
            isFocusable = false
            addView(dock, ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        root.addView(dockScroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM).apply {
            bottomMargin = dp(18)
        })

        // Soft dark corner behind the time: the turning 3D passes under it.
        root.addView(View(this).apply {
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT
                // Fades out well inside the view (a radius past its edges shows a hard border).
                gradientRadius = dp(250).toFloat()
                setGradientCenter(1f, 0f)
                colors = intArrayOf(0x80000000.toInt(), 0x00000000)
            }
        }, FrameLayout.LayoutParams(dp(500), dp(300), Gravity.TOP or Gravity.END))
        // Top right: the time (medium weight, as tvOS — the light one looked iOS 7), the weather under it (when a place is set).
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
            addView(TextClock(context).apply {
                format12Hour = "HH:mm"
                format24Hour = "HH:mm"
                setTextColor(0xF2FFFFFF.toInt())
                textSize = 22f
                typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                // Short shadow + padding: a wide blur gets cut square at the view's edges.
                setShadowLayer(5f, 0f, 1f, 0x99000000.toInt())
                setPadding(dp(6), dp(4), dp(6), dp(4))
            })
            addView(WeatherView(context, 14f), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2) })
        }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
            topMargin = dp(22)
            rightMargin = dp(SIDE - 6)
        })

        pairPanel = buildPairPanel()
        root.addView(pairPanel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return root
    }

    private fun showApps() {
        appsDirty = false
        val focusedPkg = currentFocus?.tag as? String
        dock.removeAllViews()
        val tileW = dp(TILE_W)
        val tiles = catalog.load().map { app ->
            tile(app.pkg, app.label, app.banner, app.icon, tileW, tileW * 9 / 16) { launch(app.pkg) }
        } + tile(SETTINGS_TAG, "Réglages", null, getDrawable(android.R.drawable.ic_menu_preferences), tileW * 9 / 16, tileW * 9 / 16) {
            start(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        tiles.forEachIndexed { i, t ->
            dock.addView(t, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (i > 0) leftMargin = dp(GAP)
            })
        }
        val refocus = tiles.firstOrNull { it.tag == focusedPkg } ?: tiles.firstOrNull()
        if (pairPanel.visibility != View.VISIBLE) refocus?.requestFocus()
    }

    private fun tile(tag: String, label: String, banner: android.graphics.drawable.Drawable?, icon: android.graphics.drawable.Drawable?, width: Int, height: Int, onClick: () -> Unit): View {
        val card = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(0xFF2A2F38.toInt())
            }
            outlineProvider = ViewOutlineProvider.BACKGROUND
            clipToOutline = true
            elevation = dp(6).toFloat()
        }
        if (banner != null) {
            card.addView(ImageView(this).apply {
                setImageDrawable(banner)
                scaleType = ImageView.ScaleType.CENTER_CROP
            }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        } else {
            val size = minOf(width, height) / 2
            card.addView(ImageView(this).apply {
                setImageDrawable(icon)
                scaleType = ImageView.ScaleType.FIT_CENTER
                alpha = 0.8f
            }, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
        }
        // Glass sheen + bright rim on the focused app (tvOS look).
        val shine = View(this).apply {
            background = Glass(dp(14).toFloat(), dp(2).toFloat(), fillTop = 0, fillBottom = 0, sheen = 0x40FFFFFF, rimTop = 0xCCFFFFFF.toInt(), rimBottom = 0x26FFFFFF)
            alpha = 0f
        }
        card.addView(shine, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return LinearLayout(this).apply {
            this.tag = tag
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            clipChildren = false
            isFocusable = true
            contentDescription = label
            addView(card, LinearLayout.LayoutParams(width, height))
            setOnClickListener { onClick() }
            setOnFocusChangeListener { _, focused ->
                val scale = if (focused) 1.15f else 1f
                card.animate().scaleX(scale).scaleY(scale).translationZ(if (focused) dp(18).toFloat() else 0f).setDuration(180).start()
                shine.animate().alpha(if (focused) 1f else 0f).setDuration(180).start()
            }
        }
    }

    private fun goTop() {
        dockScroll.smoothScrollTo(0, 0)
        dock.getChildAt(0)?.requestFocus()
    }

    private fun launch(pkg: String) {
        val intent = catalog.launchIntent(pkg) ?: return toast("Impossible d'ouvrir cette application.")
        start(intent)
    }

    private fun start(intent: Intent) {
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            toast("Impossible d'ouvrir cette application.")
        } catch (_: SecurityException) {
            toast("Impossible d'ouvrir cette application.")
        }
    }

    private fun showHeroMessage(text: String) {
        heroMessage.text = text
        heroMessage.animate().alpha(1f).setDuration(300).start()
    }

    private fun buildPairPanel(): FrameLayout {
        val title = TextView(this).apply {
            text = "Associer la TV à la maison"
            setTextColor(Color.WHITE)
            textSize = 28f
            gravity = Gravity.CENTER
        }
        val hint = TextView(this).apply {
            text = "Tapez le code à 6 chiffres du pont maison\n(sur le Mac : pnpm --filter @appart3d/home-bridge pair)"
            setTextColor(0xB3FFFFFF.toInt())
            textSize = 16f
            gravity = Gravity.CENTER
        }
        pairInput = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
            imeOptions = EditorInfo.IME_ACTION_DONE
            setTextColor(Color.WHITE)
            textSize = 34f
            letterSpacing = 0.4f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(0xFF2A2F38.toInt())
            }
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setOnEditorActionListener { _, action, event ->
                val done = action == EditorInfo.IME_ACTION_DONE || event?.keyCode == KeyEvent.KEYCODE_ENTER
                if (done) submitCode(text.toString())
                done
            }
        }
        pairStatus = TextView(this).apply {
            setTextColor(0xB3FFFFFF.toInt())
            textSize = 16f
            gravity = Gravity.CENTER
        }
        val ok = Button(this).apply {
            text = "Valider"
            setOnClickListener { submitCode(pairInput.text.toString()) }
        }
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val lp = { top: Int -> LinearLayout.LayoutParams(dp(420), ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) } }
            addView(title, lp(0))
            addView(hint, lp(14))
            addView(pairInput, lp(28))
            addView(ok, lp(18))
            addView(pairStatus, lp(18))
        }
        return FrameLayout(this).apply {
            setBackgroundColor(0xEB000000.toInt())
            visibility = View.GONE
            isClickable = true
            addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        }
    }

    private fun showPairing() {
        if (pairPanel.visibility == View.VISIBLE) return
        pairStatus.text = if (store.url == null) "Recherche de la maison sur le Wi-Fi…" else ""
        pairPanel.visibility = View.VISIBLE
        pairInput.requestFocus()
    }

    private fun hidePairing() {
        pairPanel.visibility = View.GONE
        pairInput.text.clear()
        goTop()
    }

    private fun setPairStatus(text: String) {
        if (pairPanel.visibility == View.VISIBLE) pairStatus.text = text else if (text.isNotEmpty() && !text.endsWith("…")) toast(text)
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // endregion

    companion object {
        private const val COOKIE_NAME = "appart3d_home"
        private const val SETTINGS_TAG = "__settings"
        private const val SIDE = 48
        private const val GAP = 24
        /** Dock tile width (dp), 16:9 banners. */
        private const val TILE_W = 140
        /** Bottom band kept for the dock (dp): the 3D fills the rest of the screen. */
        private const val DOCK_AREA = 146
        /** Lights panel width (dp). */
        private const val PANEL_W = 290
    }
}

