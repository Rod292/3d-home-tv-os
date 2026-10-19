package com.appart3d.tvlauncher

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.service.dreams.DreamService
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextClock

/**
 * Screensaver: the whole apartment turning slowly (live lights, night version after sunset) over the
 * sun-colored background, with a large clock that changes corner every minute (no burn-in).
 * Without the bridge (Mac asleep), just the clock on the background.
 */
class MaisonDream : DreamService() {
    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private lateinit var clock: LinearLayout
    private var corner = 0
    private val move = object : Runnable {
        override fun run() {
            corner = (corner + 1) % 4
            placeClock()
            main.postDelayed(this, 60_000)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        val root = FrameLayout(this).apply { background = Ambient.forSun(null) }
        val store = BridgeStore(this)
        val base = store.url
        val token = store.token
        if (base != null && token != null) {
            val w = WebView(this).apply {
                setBackgroundColor(Color.TRANSPARENT)
                alpha = 0f
                isFocusable = false
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        view.animate().alpha(1f).setStartDelay(1500).setDuration(1500).start()
                    }
                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) view.visibility = View.GONE
                    }
                }
            }
            web = w
            root.addView(w, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            CookieManager.getInstance().setCookie(base, "appart3d_home=$token; Path=/; Max-Age=31536000; SameSite=Lax") {
                w.loadUrl("$base/?view=3d&lite=1&frame=all&orbit=full&maxDpr=1.5")
            }
        }
        clock = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextClock(context).apply {
                format12Hour = "HH:mm"
                format24Hour = "HH:mm"
                setTextColor(Color.WHITE)
                textSize = 60f
                typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                setShadowLayer(24f, 0f, 2f, 0x66000000)
            })
            addView(TextClock(context).apply {
                format12Hour = "EEEE d MMMM"
                format24Hour = "EEEE d MMMM"
                setTextColor(0xCCFFFFFF.toInt())
                textSize = 20f
                typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                setShadowLayer(16f, 0f, 2f, 0x66000000)
            })
            addView(WeatherView(context, 20f), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = (8 * resources.displayMetrics.density).toInt()
            })
        }
        root.addView(clock)
        placeClock()
        setContentView(root)
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        // The home screen paused WebView timers when the dream covered it: they are process-wide.
        web?.resumeTimers()
        main.postDelayed(move, 60_000)
    }

    override fun onDreamingStopped() {
        main.removeCallbacks(move)
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        main.removeCallbacksAndMessages(null)
        web?.destroy()
        web = null
        super.onDetachedFromWindow()
    }

    private fun placeClock() {
        val m = (48 * resources.displayMetrics.density).toInt()
        val g = when (corner) {
            0 -> Gravity.BOTTOM or Gravity.START
            1 -> Gravity.TOP or Gravity.END
            2 -> Gravity.BOTTOM or Gravity.END
            else -> Gravity.TOP or Gravity.START
        }
        clock.gravity = if (g and Gravity.END == Gravity.END) Gravity.END else Gravity.START
        clock.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, g).apply { setMargins(m, m, m, m) }
        for (i in 0 until clock.childCount) (clock.getChildAt(i) as? android.widget.TextView)?.gravity = clock.gravity
    }
}
